import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as nodeLambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';

import { Construct } from 'constructs';
import { Duration } from 'aws-cdk-lib';

export interface ConsumerProps extends cdk.StackProps {
  ordersTable: dynamodb.Table;
  ordersEventBus: events.EventBus;
}

export class StatelessStack extends cdk.Stack {
  private readonly ordersTable: dynamodb.Table;
  private readonly ordersEventBus: events.EventBus;

  constructor(scope: Construct, id: string, props: ConsumerProps) {
    super(scope, id, props);

    this.ordersTable = props.ordersTable;
    this.ordersEventBus = props.ordersEventBus;

    // create the lambda function for returning an order by id
    const getOrderLambda: nodeLambda.NodejsFunction =
      new nodeLambda.NodejsFunction(this, 'GetOrderLambda', {
        runtime: lambda.Runtime.NODEJS_16_X,
        entry: path.join(__dirname, 'src/handlers/get-order/get-order.ts'),
        memorySize: 1024,
        handler: 'handler',
        bundling: {
          minify: true,
          externalModules: ['aws-sdk'],
        },
        environment: {
          TABLE_NAME: this.ordersTable.tableName,
        },
      });

    // create the lambda function for creating an order
    const createOrderLambda: nodeLambda.NodejsFunction =
      new nodeLambda.NodejsFunction(this, 'CreateOrderLambda', {
        runtime: lambda.Runtime.NODEJS_16_X,
        entry: path.join(
          __dirname,
          'src/handlers/create-order/create-order.ts'
        ),
        memorySize: 1024,
        handler: 'handler',
        bundling: {
          minify: true,
          externalModules: ['aws-sdk'],
        },
        environment: {
          TABLE_NAME: this.ordersTable.tableName,
        },
      });

    // create the orders api for our pirate costume company
    const ordersApi: apigw.RestApi = new apigw.RestApi(
      this,
      'PirateOrdersApi',
      {
        description: 'Pirate Orders API',
        deploy: true,
        deployOptions: {
          stageName: 'prod',
          loggingLevel: apigw.MethodLoggingLevel.INFO,
        },
      }
    );

    // create the rest api resources
    const orders: apigw.Resource = ordersApi.root.addResource('orders');
    const order: apigw.Resource = orders.addResource('{id}');

    // grant the relevant lambdas access to our dynamodb database
    this.ordersTable.grantReadData(getOrderLambda);
    this.ordersTable.grantWriteData(createOrderLambda);

    // create the task defintion for our workflow
    const createOrderStateMachineDefinition: sfn.Chain = sfn.Chain.start(
      new tasks.LambdaInvoke(this, 'CreateOrder', {
        lambdaFunction: createOrderLambda,
        resultPath: '$',
        outputPath: '$.Payload.body',
        timeout: Duration.seconds(20),
        comment: 'Create pirate order task',
        retryOnServiceExceptions: true,
      })
    ).next(
      new tasks.EventBridgePutEvents(this, 'SendOrderEvent', {
        resultPath: sfn.JsonPath.DISCARD, // we want to replace the output with the input
        inputPath: '$',
        comment: 'Send pirate order created event',
        entries: [
          {
            detail: sfn.TaskInput.fromJsonPathAt('$'),
            eventBus: this.ordersEventBus,
            detailType: 'OrderCreated',
            source: 'com.leespiratecostume.orders',
          },
        ],
      })
    );

    // create the state machine workflow which uses our task definition
    const createOrderStateMachine: sfn.StateMachine = new sfn.StateMachine(
      this,
      'CreatePirateOrderStateMachine',
      {
        definition: createOrderStateMachineDefinition,
        logs: {
          level: sfn.LogLevel.ALL,
          destination: new logs.LogGroup(
            this,
            'createOrderStateMachineLogGroup',
            {
              retention: logs.RetentionDays.ONE_DAY,
            }
          ),
          includeExecutionData: true,
        },
        tracingEnabled: true,
        stateMachineName: 'CreatePirateOrderStateMachine',
        stateMachineType: sfn.StateMachineType.EXPRESS,
        timeout: Duration.seconds(30),
      }
    );

    // allow the api to directly call the workflow through a StartSyncExecution
    const apigwRole: iam.Role = new iam.Role(this, 'CreatePirateOrdersRole', {
      assumedBy: new iam.ServicePrincipal('apigateway'),
      inlinePolicies: {
        startSyncExecution: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['states:StartSyncExecution'],
              effect: iam.Effect.ALLOW,
              resources: [createOrderStateMachine.stateMachineArn],
            }),
          ],
        }),
      },
    });

    // create the integration for the apigateway role i.e. the request and response for the workflow call
    const createOrdersStepFunctionOptions: apigw.IntegrationOptions = {
      credentialsRole: apigwRole,
      integrationResponses: [
        {
          statusCode: '201',
          selectionPattern: '200',
          responseTemplates: {
            'application/json': `$util.parseJson($input.path('$.output'))`,
          },
        },
      ],
      passthroughBehavior: apigw.PassthroughBehavior.NEVER,
      requestTemplates: {
        'application/json': `{
              "input": "{\\"actionType\\": \\"create\\", \\"body\\": $util.escapeJavaScript($input.json('$'))}",
              "stateMachineArn": "${createOrderStateMachine.stateMachineArn}"
            }`,
      },
    };

    // add our two method integrations for the GET and POST calls
    order.addMethod(
      'GET',
      new apigw.LambdaIntegration(getOrderLambda, {
        proxy: true,
      })
    );

    orders.addMethod(
      'POST',
      new apigw.Integration({
        type: apigw.IntegrationType.AWS,
        uri: `arn:aws:apigateway:${cdk.Aws.REGION}:states:action/StartSyncExecution`,
        integrationHttpMethod: 'POST',
        options: createOrdersStepFunctionOptions,
      }),
      { methodResponses: [{ statusCode: '201' }] }
    );

    new cdk.CfnOutput(this, 'GetOrderLambdaName', {
      value: getOrderLambda.functionName,
    });

    new cdk.CfnOutput(this, 'CreateOrderLambdaName', {
      value: createOrderLambda.functionName,
    });
  }
}

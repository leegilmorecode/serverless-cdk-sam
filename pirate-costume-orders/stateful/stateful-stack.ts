import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';

import { Construct } from 'constructs';
import { RemovalPolicy } from 'aws-cdk-lib';

export class StatefulStack extends cdk.Stack {
  public readonly ordersTable: dynamodb.Table;
  public readonly ordersEventBus: events.EventBus;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // create the dynamodb table for storing our orders
    this.ordersTable = new dynamodb.Table(this, 'PirateCostumeOrdersTable', {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: false,
      contributorInsightsEnabled: true,
      removalPolicy: RemovalPolicy.DESTROY,
      partitionKey: {
        name: 'id',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // create the event bus which we will send our order events too
    this.ordersEventBus = new events.EventBus(this, 'PirateCostumeEventBus', {
      eventBusName: 'pirate-costume-orders-event-bus',
    });
    this.ordersEventBus.applyRemovalPolicy(RemovalPolicy.DESTROY);
  }
}

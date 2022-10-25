import * as AWS from 'aws-sdk';

import {
  APIGatewayEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
} from 'aws-lambda';

import { config } from '../../../shared/config';
import { v4 as uuid } from 'uuid';

const dynamoDb = new AWS.DynamoDB.DocumentClient();

export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const correlationId = uuid();
    const method = 'get-order.handler';
    const prefix = `${correlationId} - ${method}`;

    console.log(`${prefix} - started`);

    console.log('**********************'); // used for the example of tailing

    if (!event?.pathParameters)
      throw new Error('no id in the path parameters of the event');

    const { id } = event.pathParameters;

    const ordersTable = config.tableName;

    const params: AWS.DynamoDB.DocumentClient.GetItemInput = {
      TableName: ordersTable,
      Key: {
        id,
      },
    };

    console.log(`${prefix} - get order: ${id}`);

    const { Item: item } = await dynamoDb.get(params).promise();

    return {
      statusCode: 200,
      body: JSON.stringify(item),
    };
  } catch (error) {
    console.error(error);
    throw error;
  }
};

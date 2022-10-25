import * as AWS from 'aws-sdk';

import { config } from '../../../shared/config';
import { v4 as uuid } from 'uuid';

type OrderItem = {
  productId: string;
  quantity: number;
};

type Order = {
  id: string;
  items: OrderItem[];
};

interface LambdaSfSyncResult {
  body: string;
}

interface LambdaSfSyncEvent {
  body: Order;
}

const dynamoDb = new AWS.DynamoDB.DocumentClient();

export const handler = async (
  event: LambdaSfSyncEvent
): Promise<LambdaSfSyncResult> => {
  try {
    const correlationId = uuid();
    const method = 'create-order.handler';
    const prefix = `${correlationId} - ${method}`;

    console.log(`${prefix} - started`);

    const ordersTable = config.tableName;

    // we wont validate the input with this being an example

    const order: Order = {
      id: uuid(),
      items: event.body.items,
    };

    const params: AWS.DynamoDB.DocumentClient.PutItemInput = {
      TableName: ordersTable,
      Item: order,
    };

    console.log(`${prefix} - create order: ${JSON.stringify(order)}`);

    await dynamoDb.put(params).promise();

    return {
      body: JSON.stringify(order),
    };
  } catch (error) {
    console.error(error);
    throw error;
  }
};

#!/usr/bin/env node

import 'source-map-support/register';

import * as cdk from 'aws-cdk-lib';

import { StatefulStack } from '../stateful/stateful-stack';
import { StatelessStack } from '../stateless/stateless-stack';

const app = new cdk.App();
const statefulStack = new StatefulStack(app, 'PirateCostumeStatefulStack', {});

// we use the outputs from the stateful stack as props into the stateless stack,
// essentially our long lived database and eventbus
new StatelessStack(app, 'PirateCostumeStatelessStack', {
  ordersTable: statefulStack.ordersTable,
  ordersEventBus: statefulStack.ordersEventBus,
});

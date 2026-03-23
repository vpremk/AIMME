#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AimmeStack } from '../lib/aimme-stack';
import { AimmeServerlessStack } from '../lib/aimme-serverless-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? process.env.AWS_REGION ?? 'us-east-1',
};

const useGroqCtx = app.node.tryGetContext('useGroq');
const useGroq =
  useGroqCtx === true || useGroqCtx === 'true' || useGroqCtx === '1';

// Serverless: API Gateway + Lambda + DynamoDB streams + SNS
new AimmeServerlessStack(app, 'AimmeServerlessStack', {
  env,
  useGroq,
  groqApiKey: app.node.tryGetContext('groqApiKey') as string | undefined,
  alertEmail: app.node.tryGetContext('alertEmail') as string | undefined,
});

// Optional: ECS/Fargate stack (deploy separately: cdk deploy AimmeStack)
new AimmeStack(app, 'AimmeStack', { env });

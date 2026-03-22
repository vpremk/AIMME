// infra/lib/aimme-stack.ts

import { App, Stack, StackProps } from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';

// Kinesis Data Streams are omitted here: CloudFormation's AWS::Kinesis::Stream has
// repeatedly returned InternalFailure in this account (even with KMS off + on-demand).
// Create a stream in the console (or CLI) and wire it into the task definition later, or
// use a different bus (e.g. MSK, SQS) in the app.

export class AimmeStack extends Stack {
  constructor(scope: App, id: string, props?: StackProps) {
    super(scope, id, props);

    // VPC (default minimal)
    const vpc = new ec2.Vpc(this, 'AimmeVpc', {
      maxAzs: 2,
    });

    // ECS Cluster
    const cluster = new ecs.Cluster(this, 'AimmeCluster', {
      vpc,
    });

    // DynamoDB (signals table)
    const table = new dynamodb.Table(this, 'SignalsTable', {
      partitionKey: { name: 'asset', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    // SNS Topic
    const topic = new sns.Topic(this, 'AlertsTopic');

    // ECS Fargate Service (API + Processor)
    const fargateService = new ecs_patterns.ApplicationLoadBalancedFargateService(
      this,
      'AimmeService',
      {
        cluster,
        cpu: 256,
        memoryLimitMiB: 512,
        desiredCount: 1,
        taskImageOptions: {
          image: ecs.ContainerImage.fromRegistry('amazon/amazon-ecs-sample'),
          containerPort: 8000,
          environment: {
            TABLE_NAME: table.tableName,
            SNS_TOPIC_ARN: topic.topicArn,
          },
        },
        publicLoadBalancer: true,
      }
    );

    // Permissions
    table.grantReadWriteData(fargateService.taskDefinition.taskRole);
    topic.grantPublish(fargateService.taskDefinition.taskRole);
  }
}
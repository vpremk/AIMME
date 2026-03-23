/**
 * AIMME serverless stack (Python Lambdas in `lambda_functions/`)
 * — DynamoDB (Streams), SNS, API Gateway REST, hackathon / free-tier defaults.
 */
import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import * as path from 'path';

export interface AimmeServerlessStackProps extends cdk.StackProps {
  /** When true, processing Lambda sets USE_GROQ=true and may call Groq (needs groqApiKey). */
  readonly useGroq?: boolean;
  /** Groq API key (use Secrets Manager in production). */
  readonly groqApiKey?: string;
  /** If set, creates an SNS email subscription (confirm in your inbox). */
  readonly alertEmail?: string;
}

/** Python source + optional requirements; Docker required for bundling. */
const LAMBDA_DIR = 'lambda_functions';

function pythonCode(): lambda.Code {
  const assetPath = path.join(__dirname, '..', LAMBDA_DIR);
  return lambda.Code.fromAsset(assetPath, {
    bundling: {
      image: lambda.Runtime.PYTHON_3_12.bundlingImage,
      command: [
        'bash',
        '-c',
        [
          'if [ -f requirements.txt ]; then pip install --no-cache-dir -r requirements.txt -t /asset-output; fi',
          'cp *.py /asset-output/',
        ].join(' && '),
      ],
    },
  });
}

export class AimmeServerlessStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: AimmeServerlessStackProps) {
    super(scope, id, props);

    const useGroq = props?.useGroq === true;
    const groqApiKey = props?.groqApiKey ?? '';
    const alertEmail = props?.alertEmail;

    // --- SNS: alerts (optional email demo subscription) ---
    const alertsTopic = new sns.Topic(this, 'AlertsTopic', {
      topicName: 'AlertsTopic',
      displayName: 'AIMME Alerts',
    });

    if (alertEmail) {
      alertsTopic.addSubscription(new subs.EmailSubscription(alertEmail));
    }

    // --- DynamoDB: fixed name per spec; stream → processing + alerts Lambdas ---
    const signalsTable = new dynamodb.Table(this, 'SignalsTable', {
      tableName: 'SignalsTable',
      partitionKey: { name: 'asset', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      stream: dynamodb.StreamViewType.NEW_IMAGE,
    });

    const code = pythonCode();

    const lambdaDefaults = {
      runtime: lambda.Runtime.PYTHON_3_12,
      memorySize: 256,
      architecture: lambda.Architecture.X86_64,
      code,
    };

    // --- Ingestion: GET + POST /signals ---
    const ingestionFn = new lambda.Function(this, 'IngestionLambda', {
      ...lambdaDefaults,
      handler: 'lambda_ingestion.handler',
      description: 'REST GET/POST /signals → DynamoDB raw items',
      timeout: cdk.Duration.seconds(29),
      environment: {
        TABLE_NAME: signalsTable.tableName,
      },
    });
    signalsTable.grantReadWriteData(ingestionFn);

    // --- Processing: DynamoDB stream → signal rows; optional POST /process for tests ---
    const processingFn = new lambda.Function(this, 'ProcessingLambda', {
      ...lambdaDefaults,
      handler: 'lambda_processing.handler',
      description: 'DDB stream → normalize / Groq → PutItem signals',
      timeout: cdk.Duration.seconds(60),
      environment: {
        TABLE_NAME: signalsTable.tableName,
        USE_GROQ: useGroq ? 'true' : 'false',
        GROQ_API_KEY: groqApiKey,
      },
    });
    signalsTable.grantStreamRead(processingFn);
    signalsTable.grantWriteData(processingFn);

    processingFn.addEventSource(
      new DynamoEventSource(signalsTable, {
        startingPosition: lambda.StartingPosition.LATEST,
        batchSize: 25,
        bisectBatchOnError: true,
        retryAttempts: 3,
      })
    );

    // --- Alerts: stream (signals) → SNS; optional POST /alert for tests ---
    const alertsFn = new lambda.Function(this, 'AlertsLambda', {
      ...lambdaDefaults,
      handler: 'lambda_alerts.handler',
      description: 'DDB stream (signals) → SNS notifications',
      timeout: cdk.Duration.seconds(30),
      environment: {
        SNS_TOPIC_ARN: alertsTopic.topicArn,
      },
    });
    signalsTable.grantStreamRead(alertsFn);
    alertsTopic.grantPublish(alertsFn);

    alertsFn.addEventSource(
      new DynamoEventSource(signalsTable, {
        startingPosition: lambda.StartingPosition.LATEST,
        batchSize: 50,
        bisectBatchOnError: true,
        retryAttempts: 3,
      })
    );

    // --- API Gateway (REST): minimal routes, free-tier friendly throttles ---
    const api = new apigateway.RestApi(this, 'AimmeRestApi', {
      restApiName: 'aimme-signals-api',
      description: 'AIMME REST API',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
      deployOptions: {
        throttlingRateLimit: 100,
        throttlingBurstLimit: 50,
      },
    });

    const signals = api.root.addResource('signals');
    const ingestionIntegration = new apigateway.LambdaIntegration(ingestionFn);
    signals.addMethod('GET', ingestionIntegration);
    signals.addMethod('POST', ingestionIntegration);

    // Optional manual test endpoints (same Lambdas expose /process and /alert)
    const processRes = api.root.addResource('process');
    processRes.addMethod('POST', new apigateway.LambdaIntegration(processingFn));

    const alertRes = api.root.addResource('alert');
    alertRes.addMethod('POST', new apigateway.LambdaIntegration(alertsFn));

    new cdk.CfnOutput(this, 'RestApiUrl', {
      description: 'Invoke GET/POST {url}signals',
      value: api.url,
    });
    new cdk.CfnOutput(this, 'SignalsUrl', {
      value: api.urlForPath('/signals'),
    });
    new cdk.CfnOutput(this, 'ProcessTestUrl', {
      description: 'POST JSON raw item for processing test',
      value: api.urlForPath('/process'),
    });
    new cdk.CfnOutput(this, 'AlertTestUrl', {
      description: 'POST JSON signal-shaped body for SNS test',
      value: api.urlForPath('/alert'),
    });
    new cdk.CfnOutput(this, 'SignalsTableName', {
      value: signalsTable.tableName,
    });
    new cdk.CfnOutput(this, 'AlertsTopicArn', {
      value: alertsTopic.topicArn,
    });
  }
}

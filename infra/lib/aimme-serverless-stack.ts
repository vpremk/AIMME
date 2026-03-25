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
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
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
    const requireApiKey = this.node.tryGetContext('requireApiKey') === true;
    const wafRateLimit = Number(this.node.tryGetContext('wafRateLimit') ?? 2000);
    const firebaseSecretArn = this.node.tryGetContext('firebaseAdminSecretArn');
    const firebaseSecretName = this.node.tryGetContext('firebaseAdminSecretName');

    // --- Firebase Admin secret: support complete ARN, partial ARN, or secret name ---
    const firebaseAdminSecret = firebaseSecretArn
      ? /-[A-Za-z0-9]{6}$/.test(String(firebaseSecretArn))
        ? secretsmanager.Secret.fromSecretCompleteArn(
            this,
            'FirebaseAdminSecretImported',
            String(firebaseSecretArn),
          )
        : secretsmanager.Secret.fromSecretPartialArn(
            this,
            'FirebaseAdminSecretImported',
            String(firebaseSecretArn),
          )
      : firebaseSecretName
        ? secretsmanager.Secret.fromSecretNameV2(
            this,
            'FirebaseAdminSecretImported',
            String(firebaseSecretName),
          )
        : new secretsmanager.Secret(this, 'FirebaseAdminSecret', {
            secretName: 'aimme/firebase/admin',
            description:
              'Firebase Admin credentials JSON {projectId,clientEmail,privateKey} for AIMME services',
            secretObjectValue: {
              projectId: cdk.SecretValue.unsafePlainText(''),
              clientEmail: cdk.SecretValue.unsafePlainText(''),
              privateKey: cdk.SecretValue.unsafePlainText(''),
            },
          });

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
    signalsTable.addGlobalSecondaryIndex({
      indexName: 'OrgLedgerIndex',
      partitionKey: { name: 'orgId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'orgLedgerSk', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    const userManagementTable = new dynamodb.Table(this, 'UserManagementTable', {
      tableName: 'UserManagementTable',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // --- DynamoDB: org-level UI branding (web reads via ORG_BRANDING_TABLE_NAME) ---
    // PK: orgId (string). Optional attributes: displayName, logoUrl, primaryColor, accentColor, badgeText.
    const orgBrandingTable = new dynamodb.Table(this, 'OrgBrandingTable', {
      tableName: 'OrgBrandingTable',
      partitionKey: { name: 'orgId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
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
        USER_MGMT_TABLE_NAME: userManagementTable.tableName,
        FIREBASE_SECRET_ARN: firebaseAdminSecret.secretArn,
      },
    });
    signalsTable.grantReadWriteData(ingestionFn);
    userManagementTable.grantReadWriteData(ingestionFn);
    firebaseAdminSecret.grantRead(ingestionFn);

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
        FIREBASE_SECRET_ARN: firebaseAdminSecret.secretArn,
      },
    });
    signalsTable.grantStreamRead(processingFn);
    signalsTable.grantWriteData(processingFn);
    firebaseAdminSecret.grantRead(processingFn);

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
        FIREBASE_SECRET_ARN: firebaseAdminSecret.secretArn,
      },
    });
    signalsTable.grantStreamRead(alertsFn);
    alertsTopic.grantPublish(alertsFn);
    firebaseAdminSecret.grantRead(alertsFn);

    alertsFn.addEventSource(
      new DynamoEventSource(signalsTable, {
        startingPosition: lambda.StartingPosition.LATEST,
        batchSize: 50,
        bisectBatchOnError: true,
        retryAttempts: 3,
      })
    );

    // --- Admin: user management + ops snapshots ---
    const adminFn = new lambda.Function(this, 'AdminLambda', {
      ...lambdaDefaults,
      handler: 'lambda_admin.handler',
      description: 'User management and ops stats APIs',
      timeout: cdk.Duration.seconds(30),
      environment: {
        TABLE_NAME: signalsTable.tableName,
        USER_MGMT_TABLE_NAME: userManagementTable.tableName,
      },
    });
    signalsTable.grantReadData(adminFn);
    userManagementTable.grantReadWriteData(adminFn);

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
    signals.addMethod('POST', ingestionIntegration, { apiKeyRequired: requireApiKey });

    // Optional manual test endpoints (same Lambdas expose /process and /alert)
    const processRes = api.root.addResource('process');
    processRes.addMethod('POST', new apigateway.LambdaIntegration(processingFn), {
      apiKeyRequired: requireApiKey,
    });

    const alertRes = api.root.addResource('alert');
    alertRes.addMethod('POST', new apigateway.LambdaIntegration(alertsFn), {
      apiKeyRequired: requireApiKey,
    });

    const adminRes = api.root.addResource('admin');
    const adminUsersRes = adminRes.addResource('users');
    const adminUsersLoginRes = adminUsersRes.addResource('login');
    adminUsersLoginRes.addMethod('POST', new apigateway.LambdaIntegration(adminFn), {
      apiKeyRequired: requireApiKey,
    });
    adminUsersRes.addMethod('GET', new apigateway.LambdaIntegration(adminFn), {
      apiKeyRequired: requireApiKey,
    });
    adminUsersRes.addMethod('POST', new apigateway.LambdaIntegration(adminFn), {
      apiKeyRequired: requireApiKey,
    });
    const adminOpsRes = adminRes.addResource('ops');
    adminOpsRes.addMethod('GET', new apigateway.LambdaIntegration(adminFn), {
      apiKeyRequired: requireApiKey,
    });

    if (requireApiKey) {
      const key = api.addApiKey('AimmeApiKey', {
        description: 'AIMME write/test endpoint API key',
      });
      const plan = api.addUsagePlan('AimmeUsagePlan', {
        name: 'aimme-standard-plan',
        throttle: {
          rateLimit: 50,
          burstLimit: 25,
        },
        quota: {
          limit: 100000,
          period: apigateway.Period.MONTH,
        },
      });
      plan.addApiKey(key);
      plan.addApiStage({ stage: api.deploymentStage });
    }

    // Regional WAF on API Gateway stage: managed protections + rate limiting.
    const webAcl = new wafv2.CfnWebACL(this, 'AimmeApiWebAcl', {
      scope: 'REGIONAL',
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'aimme-api-web-acl',
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: 'AWSManagedCommonRules',
          priority: 0,
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
            },
          },
          overrideAction: { none: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'aimme-common-rules',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'AWSManagedIpReputation',
          priority: 1,
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesAmazonIpReputationList',
            },
          },
          overrideAction: { none: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'aimme-ip-reputation-rules',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'RateLimitRule',
          priority: 2,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              aggregateKeyType: 'IP',
              limit: wafRateLimit,
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'aimme-rate-limit-rule',
            sampledRequestsEnabled: true,
          },
        },
      ],
    });

    new wafv2.CfnWebACLAssociation(this, 'AimmeApiWebAclAssociation', {
      resourceArn: `arn:aws:apigateway:${this.region}::/restapis/${api.restApiId}/stages/${api.deploymentStage.stageName}`,
      webAclArn: webAcl.attrArn,
    });

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
    new cdk.CfnOutput(this, 'AdminUsersUrl', {
      description: 'GET/POST admin users',
      value: api.urlForPath('/admin/users'),
    });
    new cdk.CfnOutput(this, 'AdminOpsUrl', {
      description: 'GET ops snapshots',
      value: api.urlForPath('/admin/ops'),
    });
    new cdk.CfnOutput(this, 'SignalsTableName', {
      value: signalsTable.tableName,
    });
    new cdk.CfnOutput(this, 'AlertsTopicArn', {
      value: alertsTopic.topicArn,
    });
    new cdk.CfnOutput(this, 'UserManagementTableName', {
      value: userManagementTable.tableName,
    });
    new cdk.CfnOutput(this, 'OrgBrandingTableName', {
      description: 'Set this value as ORG_BRANDING_TABLE_NAME in Vercel',
      value: orgBrandingTable.tableName,
    });
    new cdk.CfnOutput(this, 'FirebaseAdminSecretArn', {
      value: firebaseAdminSecret.secretArn,
    });
  }
}

/**
 * DynamoDB Streams on `signal` rows: publish to SNS when anomaly / high conviction.
 */
import type { DynamoDBStreamHandler } from 'aws-lambda';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { AttributeValue } from '@aws-sdk/client-dynamodb';

const sns = new SNSClient({});
const TOPIC = process.env.SNS_TOPIC_ARN!;

export const handler: DynamoDBStreamHandler = async (event) => {
  for (const record of event.Records) {
    if (record.eventName !== 'INSERT' && record.eventName !== 'MODIFY') continue;
    const newImage = record.dynamodb?.NewImage;
    if (!newImage) continue;

    const row = unmarshall(newImage as Record<string, AttributeValue>) as {
      type?: string;
      anomaly?: boolean;
      signal?: string;
      score?: number;
      asset?: string;
      timestamp?: number;
    };

    if (row.type !== 'signal') continue;

    const shouldAlert =
      row.anomaly === true ||
      (typeof row.score === 'number' && (row.score >= 0.9 || row.score <= 0.1));

    if (!shouldAlert) continue;

    await sns.send(
      new PublishCommand({
        TopicArn: TOPIC,
        Subject: `[AIMME] Alert ${row.asset ?? 'unknown'}`,
        Message: JSON.stringify(
          {
            asset: row.asset,
            timestamp: row.timestamp,
            signal: row.signal,
            score: row.score,
            anomaly: row.anomaly,
          },
          null,
          2
        ),
      })
    );
  }
};

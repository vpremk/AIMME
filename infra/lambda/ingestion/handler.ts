/**
 * Scheduled ingestion: mock Massive-style ticks → DynamoDB as `raw` records.
 * Trigger: EventBridge rate (see stack).
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME!;

const ASSETS = ['AAPL', 'MSFT', 'GOOG', 'TSLA'];

export const handler = async (): Promise<void> => {
  const asset = ASSETS[Math.floor(Math.random() * ASSETS.length)]!;
  const timestamp = Date.now();
  const price = 100 + Math.random() * 50;

  await doc.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        asset,
        timestamp,
        type: 'raw',
        payload: {
          source: 'mock-massive',
          price: Number(price.toFixed(4)),
          volume: Math.floor(Math.random() * 1_000_000),
        },
      },
    })
  );
};

/**
 * API Gateway Lambda: GET /signals (list) and POST /signals (write raw event).
 */
import type { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME!;

export const handler: APIGatewayProxyHandler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    if (event.httpMethod === 'GET') {
      const limit = Math.min(
        parseInt(event.queryStringParameters?.limit ?? '50', 10) || 50,
        500
      );
      const res = await client.send(
        new ScanCommand({
          TableName: TABLE,
          Limit: limit,
        })
      );
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          items: res.Items ?? [],
          count: res.Count ?? 0,
        }),
      };
    }

    if (event.httpMethod === 'POST') {
      if (!event.body) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Missing body' }),
        };
      }
      const body = JSON.parse(event.body) as {
        asset: string;
        payload?: Record<string, unknown>;
      };
      if (!body.asset || typeof body.asset !== 'string') {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'asset (string) is required' }),
        };
      }
      const timestamp = Date.now();
      const item = {
        asset: body.asset,
        timestamp,
        type: 'raw',
        payload: body.payload ?? {},
      };
      await client.send(
        new PutCommand({
          TableName: TABLE,
          Item: item,
        })
      );
      return {
        statusCode: 201,
        headers,
        body: JSON.stringify({ ok: true, item }),
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  } catch (e) {
    console.error(e);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: e instanceof Error ? e.message : 'Internal error',
      }),
    };
  }
};

/**
 * DynamoDB Streams → normalize raw events, optional Groq inference, write `signal` rows.
 * Skips `type=signal` to avoid feedback loops.
 */
import type { DynamoDBStreamHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { AttributeValue } from '@aws-sdk/client-dynamodb';

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME!;

interface GroqResult {
  signal: string;
  score: number;
  anomaly: boolean;
}

async function inferWithGroq(payload: unknown): Promise<GroqResult> {
  const useGroq = process.env.USE_GROQ === 'true';
  const key = process.env.GROQ_API_KEY;
  if (!useGroq || !key) {
    const score = Math.random();
    return {
      signal: score > 0.7 ? 'BUY' : score < 0.3 ? 'SELL' : 'HOLD',
      score,
      anomaly: score > 0.92 || score < 0.08,
    };
  }

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [
        {
          role: 'system',
          content:
            'You are a trading assistant. Reply with JSON only: {"signal":"BUY"|"SELL"|"HOLD","score":0-1,"anomaly":boolean}',
        },
        {
          role: 'user',
          content: `Analyze this market microstructure snippet: ${JSON.stringify(payload).slice(0, 2000)}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 128,
    }),
  });

  if (!res.ok) {
    console.warn('Groq error', res.status, await res.text());
    return { signal: 'HOLD', score: 0.5, anomaly: false };
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content ?? '{}';
  try {
    const parsed = JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim()) as GroqResult;
    return {
      signal: parsed.signal ?? 'HOLD',
      score: typeof parsed.score === 'number' ? parsed.score : 0.5,
      anomaly: Boolean(parsed.anomaly),
    };
  } catch {
    return { signal: 'HOLD', score: 0.5, anomaly: false };
  }
}

export const handler: DynamoDBStreamHandler = async (event) => {
  for (const record of event.Records) {
    if (record.eventName !== 'INSERT' && record.eventName !== 'MODIFY') continue;
    const newImage = record.dynamodb?.NewImage;
    if (!newImage) continue;

    const row = unmarshall(newImage as Record<string, AttributeValue>) as {
      asset?: string;
      timestamp?: number;
      type?: string;
      payload?: Record<string, unknown>;
    };

    if (row.type !== 'raw') continue;

    const result = await inferWithGroq(row.payload ?? row);

    await doc.send(
      new PutCommand({
        TableName: TABLE,
        Item: {
          asset: row.asset!,
          timestamp: Date.now(),
          type: 'signal',
          signal: result.signal,
          score: result.score,
          anomaly: result.anomaly,
          sourceTimestamp: row.timestamp,
        },
      })
    );
  }
};

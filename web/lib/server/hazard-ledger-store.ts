import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

export type HazardLedgerRecord = {
  orgKey: string;
  key: string;
  txHash: string;
  status: "pending" | "submitted" | "confirmed" | "failed";
  chainId: number;
  explorerUrl: string;
  lastError?: string;
  updatedAt: number;
};

function env(name: string): string {
  return String(process.env[name] || "").trim();
}

function tableName(): string {
  return env("HAZARD_LEDGER_TABLE_NAME");
}

function region(): string {
  return env("AWS_REGION") || env("AWS_DEFAULT_REGION") || "us-east-1";
}

let doc: DynamoDBDocumentClient | null = null;
function client(): DynamoDBDocumentClient {
  if (doc) return doc;
  const ddb = new DynamoDBClient({ region: region() });
  doc = DynamoDBDocumentClient.from(ddb, {
    marshallOptions: { removeUndefinedValues: true },
  });
  return doc;
}

type Key = { orgKey: string; key: string };

export async function getHazardLedgerRecord(k: Key): Promise<HazardLedgerRecord | null> {
  const tn = tableName();
  if (!tn) return null;
  const res = await client().send(
    new GetCommand({
      TableName: tn,
      Key: k,
    }),
  );
  return (res.Item as HazardLedgerRecord | undefined) ?? null;
}

export async function putHazardLedgerRecord(rec: HazardLedgerRecord): Promise<void> {
  const tn = tableName();
  if (!tn) return;
  await client().send(
    new PutCommand({
      TableName: tn,
      Item: rec,
    }),
  );
}

export async function updateHazardLedgerStatus(input: {
  orgKey: string;
  key: string;
  status: "pending" | "submitted" | "confirmed" | "failed";
  updatedAt: number;
}): Promise<void> {
  const tn = tableName();
  if (!tn) return;
  await client().send(
    new UpdateCommand({
      TableName: tn,
      Key: { orgKey: input.orgKey, key: input.key },
      UpdateExpression: "SET #status = :s, updatedAt = :u",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":s": input.status, ":u": input.updatedAt },
    }),
  );
}


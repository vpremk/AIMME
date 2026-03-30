/**
 * DynamoDB / API item shapes from AIMME serverless (GET /signals).
 */
export type SignalRow = {
  /** Stable row key for React lists */
  id: string;
  asset: string;
  timestamp: number;
  type: string;
  price?: number;
  volume?: number;
  signal?: string;
  score?: number;
  anomaly?: boolean;
  sourceTimestamp?: number;
  userId?: string;
  userName?: string;
  termsAccepted?: boolean;
  /** Auth0 org / sandbox / public scope from ingestion (DynamoDB). */
  orgId?: string;
  /** Set when this row was created by stream-driven volume outlier logic. */
  alertSource?: string;
  /** Multiplier vs avg of prior raw `payload.volume` samples (env `VOLUME_OUTLIER_FACTOR`). */
  volumeOutlierFactor?: number;
  baselineAvgVolume?: number;
  /** Volume from the triggering raw event. */
  sourceVolume?: number;
  priorSampleSize?: number;
};

export type SignalsResponse = {
  items: unknown[];
  count?: number;
};

/** UserManagement DynamoDB row (GET /admin/users). */
export type UserMgmtRow = {
  userId: string;
  name?: string;
  role?: string;
  loginCount: number;
  termsAccepted?: boolean;
  createdAt?: number;
  updatedAt?: number;
  lastLoginAt?: number;
};

export type Candle = {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type MassiveTelemetry = {
  totalRequests: number;
  successCount: number;
  upstreamErrorCount: number;
  networkErrorCount: number;
  lastSymbol: string | null;
  lastStatus: number | null;
  lastError: string | null;
  lastLatencyMs: number | null;
  lastEventAt: number | null;
};

export type HazardTx = {
  key: string;
  txHash: string;
  status: "pending" | "submitted" | "confirmed" | "failed";
  chainId: number;
  explorerUrl: string;
  lastError?: string;
  updatedAt: number;
  explorerStatus?: "confirmed" | "failed" | "pending" | "unknown_no_api_key" | "unknown_error";
  explorerError?: string;
  /** Short operator hint when status cannot be resolved (e.g. missing env). */
  explorerHint?: string;
};

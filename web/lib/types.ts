export type SignalKind = "BUY" | "SELL" | "HOLD";

export type SignalItem = {
  id: number;
  asset: string;
  timestamp: number;
  signal: SignalKind;
  confidence: number;
  anomaly: boolean;
};

export type PaginatedSignals = {
  items: SignalItem[];
  total: number;
  limit: number;
  offset: number;
};

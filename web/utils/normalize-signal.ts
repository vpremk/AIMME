import type { SignalRow } from "./types";

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Normalize API/DynamoDB/FastAPI rows into dashboard SignalRow (infers `type` when missing). */
export function normalizeItem(raw: Record<string, unknown>): SignalRow {
  const asset = String(raw.asset ?? "");
  const ts = Number(raw.timestamp ?? 0);
  const payload =
    raw.payload && typeof raw.payload === "object"
      ? (raw.payload as Record<string, unknown>)
      : {};
  const price = toNum(payload.price ?? raw.price);
  const volume = toNum(payload.volume ?? raw.volume);
  const signal = raw.signal != null ? String(raw.signal) : undefined;
  const score = toNum(raw.score ?? raw.confidence);
  const type =
    raw.type != null
      ? String(raw.type)
      : signal
        ? "signal"
        : payload.price != null || payload.volume != null
          ? "raw"
          : "unknown";
  const idTail = raw.id != null ? String(raw.id) : String(raw.type ?? "x");
  return {
    id: `${asset}-${ts}-${idTail}`,
    asset,
    timestamp: ts,
    type,
    price: price ?? undefined,
    volume: volume ?? undefined,
    signal,
    score: score ?? undefined,
    anomaly: Boolean(raw.anomaly),
    sourceTimestamp: toNum(raw.sourceTimestamp) ?? undefined,
    userId: raw.userId != null ? String(raw.userId) : undefined,
    userName: raw.userName != null ? String(raw.userName) : undefined,
    termsAccepted: raw.termsAccepted === true,
    orgId: raw.orgId != null ? String(raw.orgId) : undefined,
    alertSource: raw.alertSource != null ? String(raw.alertSource) : undefined,
    volumeOutlierFactor: toNum(raw.volumeOutlierFactor) ?? undefined,
    baselineAvgVolume: toNum(raw.baselineAvgVolume) ?? undefined,
    sourceVolume: toNum(raw.sourceVolume) ?? undefined,
    priorSampleSize: toNum(raw.priorSampleSize) ?? undefined,
  };
}

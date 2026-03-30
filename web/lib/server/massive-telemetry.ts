type EventType = "success" | "upstream_error" | "network_error";

type TelemetryState = {
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

const state: TelemetryState = {
  totalRequests: 0,
  successCount: 0,
  upstreamErrorCount: 0,
  networkErrorCount: 0,
  lastSymbol: null,
  lastStatus: null,
  lastError: null,
  lastLatencyMs: null,
  lastEventAt: null,
};

export function recordMassiveEvent(input: {
  type: EventType;
  symbol: string;
  status: number | null;
  latencyMs: number;
  error?: string;
}): void {
  state.totalRequests += 1;
  if (input.type === "success") state.successCount += 1;
  else if (input.type === "upstream_error") state.upstreamErrorCount += 1;
  else state.networkErrorCount += 1;

  state.lastSymbol = input.symbol;
  state.lastStatus = input.status;
  state.lastLatencyMs = Math.max(0, Math.floor(input.latencyMs));
  state.lastError = input.error ?? null;
  state.lastEventAt = Date.now();
}

export function getMassiveTelemetrySnapshot(): TelemetryState {
  return { ...state };
}

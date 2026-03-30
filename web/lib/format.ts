export function formatTs(ts: number): string {
  const ms = ts > 1e12 ? ts : ts * 1000;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(ms));
}

export function formatChartTime(ts: number): string {
  const ms = ts > 1e12 ? ts : ts * 1000;
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(ms));
}

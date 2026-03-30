/**
 * Deterministic demo price/volume for rows (API signals omit market fields).
 */
export function demoPriceVolume(asset: string, id: number): {
  price: string;
  volume: string;
} {
  let h = id * 31;
  for (let i = 0; i < asset.length; i++) {
    h = (h + asset.charCodeAt(i) * (i + 1)) | 0;
  }
  const abs = Math.abs(h);
  const price = 50 + (abs % 450) + (id % 100) / 100;
  const volume = 10_000 + (abs * 7) % 1_900_000;
  return {
    price: price.toFixed(2),
    volume: volume.toLocaleString("en-US", { maximumFractionDigits: 0 }),
  };
}

export function syntheticPriceSeries(
  asset: string,
  timestamps: number[],
  confidences: number[],
): { t: number; p: number }[] {
  let seed = 0;
  for (let i = 0; i < asset.length; i++) seed += asset.charCodeAt(i) * (i + 3);
  return timestamps.map((ts, i) => {
    const wobble = Math.sin(ts / 1000 + seed) * 8;
    const p = 100 + confidences[i] * 120 + wobble + (i % 5);
    return { t: ts, p: Math.round(p * 100) / 100 };
  });
}

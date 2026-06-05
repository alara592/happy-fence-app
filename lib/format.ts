/** Currency, always $ + commas (handoff rule). Cents only when present. */
const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function fmtUSD(n: number): string {
  return usd.format(n);
}

export function fmtDate(iso: string): string {
  // date column is YYYY-MM-DD; render without timezone shifting
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

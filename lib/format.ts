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

/** Appointment start (stored UTC) shown in Miami time, e.g. "May 26, 4:30 PM". */
export function fmtApptTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Just the clock time, Miami zone, e.g. "5:00 PM". */
export function fmtApptClock(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** YYYY-MM-DD of an instant in Miami time — seeds a project's date column. */
export function etDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

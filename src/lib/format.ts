/**
 * Formatting helpers.
 *
 * Every function here distinguishes "no value" from "zero". `formatPercent(0)`
 * renders "0.00%" while `formatPercent(null)` renders an em dash, because a
 * missing statistic and a statistic that happens to be zero mean different
 * things and the UI must not conflate them.
 */

export const MISSING = "—";

export function isMissing(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === "number" && !Number.isFinite(value));
}

export function formatNumber(
  value: number | string | null | undefined,
  digits = 2,
): string {
  if (isMissing(value)) return MISSING;
  const n = typeof value === "string" ? Number.parseFloat(value) : (value as number);
  if (!Number.isFinite(n)) return MISSING;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatPercent(
  value: number | null | undefined,
  digits = 2,
  { withSign = false }: { withSign?: boolean } = {},
): string {
  if (isMissing(value)) return MISSING;
  const pct = (value as number) * 100;
  const sign = withSign && pct > 0 ? "+" : "";
  return `${sign}${pct.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

export function formatPrice(
  value: number | string | null | undefined,
  currency?: string,
): string {
  if (isMissing(value)) return MISSING;
  const n = typeof value === "string" ? Number.parseFloat(value) : (value as number);
  if (!Number.isFinite(n)) return MISSING;
  // More decimals for sub-unit prices, where two would hide the whole move.
  const digits = Math.abs(n) < 1 ? 4 : 2;
  const text = n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return currency ? `${text} ${currency}` : text;
}

/** Compact volume: 1.2M rather than 1,234,567. */
export function formatVolume(value: number | string | null | undefined): string {
  if (isMissing(value)) return MISSING;
  const n = typeof value === "string" ? Number.parseFloat(value) : (value as number);
  if (!Number.isFinite(n)) return MISSING;
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/** Large currency amounts, as fundamentals report them. */
export function formatBigCurrency(
  value: number | null | undefined,
  currency = "USD",
): string {
  if (isMissing(value)) return MISSING;
  const n = value as number;
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)}T ${currency}`;
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B ${currency}`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M ${currency}`;
  return `${sign}${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })} ${currency}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return MISSING;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return MISSING;
  return d.toISOString().slice(0, 10);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return MISSING;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return MISSING;
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} UTC`;
}

export function formatRatio(value: number | null | undefined, digits = 2): string {
  if (isMissing(value)) return MISSING;
  return `${formatNumber(value, digits)}×`;
}

export function directionClass(value: number | null | undefined): string {
  if (isMissing(value)) return "neutral";
  const n = value as number;
  if (n > 0) return "up";
  if (n < 0) return "down";
  return "neutral";
}

/** Humanise a snake_case key for display. */
export function humanise(key: string): string {
  const text = key.replace(/_/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** ISO date string for a date N days before `from`. */
export function daysBefore(days: number, from = new Date()): string {
  const d = new Date(from.getTime() - days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "5m ago", "3h ago", "2d ago", else a local date. */
export function relativeTime(date: Date): string {
  const delta = Date.now() - date.getTime();
  if (delta < MINUTE) {
    return "just now";
  }
  if (delta < HOUR) {
    return `${Math.floor(delta / MINUTE)}m ago`;
  }
  if (delta < DAY) {
    return `${Math.floor(delta / HOUR)}h ago`;
  }
  if (delta < 30 * DAY) {
    return `${Math.floor(delta / DAY)}d ago`;
  }
  return date.toLocaleDateString();
}

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** "0 B", "412 KB", "1.2 GB" — tabular-friendly, one decimal max. */
export function formatBytes(value: number): string {
  if (value <= 0) {
    return "0 B";
  }
  const power = Math.min(Math.floor(Math.log(value) / Math.log(1024)), BYTE_UNITS.length - 1);
  const scaled = value / 1024 ** power;
  const rounded = scaled >= 10 || power === 0 ? Math.round(scaled) : scaled.toFixed(1);
  return `${rounded} ${BYTE_UNITS[power]}`;
}

/** Compact count: 1204 -> "1,204". */
export function formatCount(value: number): string {
  return new Intl.NumberFormat().format(Math.round(value));
}

/** "MM:SS" (also "M:SS" / "MMM:SS") -> milliseconds, or null if invalid. */
export function parseTime(input: string): number | null {
  const m = input.trim().match(/^(\d{1,3}):([0-5]\d)$/);
  if (!m) return null;
  return (Number(m[1]) * 60 + Number(m[2])) * 1000;
}

/** milliseconds -> "MM:SS" */
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

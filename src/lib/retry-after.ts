/** "N s", "N min" or "N h" for a 429 message; a generic phrase when unknown. */
export function formatRetryAfter(seconds: number | undefined): string {
  if (seconds === undefined || !(seconds > 0)) return 'a few minutes'
  if (seconds < 60) return `${Math.ceil(seconds)} s`
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} min`
  return `${Math.ceil(seconds / 3600)} h`
}

import { APP_LOCALE, formatNumber } from '@/lib/format'

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/

/**
 * "YYYY-MM" -> "Nov 2026" (full) or "Nov 26" (tick). Built in UTC so the
 * viewer's time zone cannot shift the month. Anything else is returned as is.
 */
export function formatMonth(month: string, style: 'full' | 'tick') {
  const m = MONTH.exec(month)
  if (!m) return month
  return new Intl.DateTimeFormat(APP_LOCALE, {
    month: 'short',
    year: style === 'full' ? 'numeric' : '2-digit',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)))
}

export function formatCount(n: number) {
  return formatNumber(n)
}

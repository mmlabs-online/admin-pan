/** The one UI locale (PAN-024, ADR 0008). All date/number formatting goes through here. */
export const APP_LOCALE = 'en-US'

const dateFmt = new Intl.DateTimeFormat(APP_LOCALE, { dateStyle: 'medium' })
const dateTimeFmt = new Intl.DateTimeFormat(APP_LOCALE, {
  dateStyle: 'medium',
  timeStyle: 'short',
})
const dateTimeZoneFmt = new Intl.DateTimeFormat(APP_LOCALE, {
  // `dateStyle` can't be combined with `timeZoneName`.
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
})
const numberFmt = new Intl.NumberFormat(APP_LOCALE)

const toDate = (value: string | Date) =>
  value instanceof Date ? value : new Date(value)

export function formatDate(value: string | Date) {
  return dateFmt.format(toDate(value))
}

export function formatDateTime(value: string | Date) {
  return dateTimeFmt.format(toDate(value))
}

/** Like `formatDateTime`, with the time zone name (expiry times, appsec F6). */
export function formatDateTimeZone(value: string | Date) {
  return dateTimeZoneFmt.format(toDate(value))
}

export function formatNumber(n: number) {
  return numberFmt.format(n)
}

/**
 * Client-controlled text as one plain line: strips control and bidi characters
 * so it cannot reorder or hide surrounding text (R6). Pinned by
 * plain-label.test.ts.
 */
export function toPlainLabel(s: string): string {
  return (
    s
      // eslint-disable-next-line no-control-regex -- stripping controls is the point
      .replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g, ' ')
      .replace(
        /[\u061C\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF\uFFF9-\uFFFB\u{E0000}-\u{E007F}]/gu,
        ''
      )
      .trim()
  )
}

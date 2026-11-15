import { describe, expect, it } from 'vitest'

const files = Object.entries(
  import.meta.glob('/src/**/*.{ts,tsx}', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>
).filter(
  ([path]) =>
    !path.startsWith('/src/api/') &&
    !/\.test\.tsx?$/.test(path) &&
    path !== '/src/routeTree.gen.ts' &&
    !path.startsWith('/src/components/ui/')
)

const offenders = (re: RegExp) =>
  files.filter(([, src]) => re.test(src)).map(([path]) => path)

describe('HTTP only via src/api (R2)', () => {
  it('no source file outside src/api uses fetch, XMLHttpRequest, WebSocket, EventSource, sendBeacon or axios', () => {
    expect(files.length).toBeGreaterThan(10)
    for (const re of [
      /\bfetch\s*\(/,
      /\bXMLHttpRequest\b/,
      /new\s+(WebSocket|EventSource)\b/,
      /sendBeacon/,
      /from\s+['"]axios/,
    ]) {
      expect(offenders(re), String(re)).toEqual([])
    }
  })

  it('no source file outside src/api disables the no-restricted-* rules', () => {
    expect(
      offenders(
        /eslint-disable[^\n]*no-restricted-(globals|imports|properties)/
      )
    ).toEqual([])
  })
})

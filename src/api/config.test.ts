import { describe, expect, it } from 'vitest'
import { parseApiBaseUrl } from './config'

const prod = { prod: true, dev: false }
const dev = { prod: false, dev: true }

describe('parseApiBaseUrl', () => {
  it('accepts an https origin and normalises a trailing slash', () => {
    expect(parseApiBaseUrl('https://api.mmlabs.online/', prod)).toBe(
      'https://api.mmlabs.online'
    )
  })

  it('accepts http://localhost:<port> and http://127.0.0.1 only in dev', () => {
    expect(parseApiBaseUrl('http://localhost:5173', dev)).toBe(
      'http://localhost:5173'
    )
    expect(parseApiBaseUrl('http://127.0.0.1:8000', dev)).toBe(
      'http://127.0.0.1:8000'
    )
    expect(() => parseApiBaseUrl('http://example.com', dev)).toThrow()
  })

  it('rejects http in production', () => {
    expect(() => parseApiBaseUrl('http://localhost:5173', prod)).toThrow()
  })

  it('rejects a value with a path (e.g. /api/v1), query, hash or user:pass@', () => {
    for (const v of [
      'https://api.mmlabs.online/api/v1',
      'https://api.mmlabs.online/?a=1',
      'https://api.mmlabs.online/#x',
      'https://user:pass@api.mmlabs.online',
    ]) {
      expect(() => parseApiBaseUrl(v, prod)).toThrow()
    }
  })

  it('rejects javascript:, empty and missing values', () => {
    expect(() => parseApiBaseUrl('javascript:alert(1)', dev)).toThrow()
    expect(() => parseApiBaseUrl('', dev)).toThrow()
    expect(() => parseApiBaseUrl(undefined, dev)).toThrow()
  })
})

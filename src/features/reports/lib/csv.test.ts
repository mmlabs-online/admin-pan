import { describe, expect, it } from 'vitest'
import { type Report } from '../data/schema'
import {
  buildCsv,
  buildReportRows,
  canDownload,
  escapeCsvCell,
  reportFileName,
} from './csv'

const REPORT: Report = {
  id: 'rep-1',
  name: 'Sign-ups / Q4, "board"',
  type: 'user_signups',
  params: {
    app_key: 'stoktok',
    date_from: '2026-10-01',
    date_to: '2026-10-31',
  },
  format: 'csv',
  schedule: 'none',
  status: 'ready',
  last_run_at: '2026-11-01T09:00:00.000Z',
  row_count: 5,
  created_by: 'ops@mmlabs.online',
  created_at: '2026-09-01T09:00:00.000Z',
}

describe('escapeCsvCell', () => {
  it('leaves plain values unchanged and renders null as empty', () => {
    expect(escapeCsvCell('abc')).toBe('abc')
    expect(escapeCsvCell(42)).toBe('42')
    expect(escapeCsvCell(null)).toBe('')
    expect(escapeCsvCell(undefined)).toBe('')
  })

  it('quotes cells with commas, quotes and line breaks', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"')
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""')
    expect(escapeCsvCell('line\nbreak')).toBe('"line\nbreak"')
  })

  it('neutralises spreadsheet formulas', () => {
    expect(escapeCsvCell('=SUM(A1)')).toBe("'=SUM(A1)")
    expect(escapeCsvCell('+1')).toBe("'+1")
    expect(escapeCsvCell('@cmd')).toBe("'@cmd")
    // numbers are not text, so a negative number stays a number
    expect(escapeCsvCell(-5)).toBe('-5')
  })
})

describe('buildCsv', () => {
  it('builds a header and rows with CRLF line endings', () => {
    const csv = buildCsv(
      ['date', 'count'],
      [
        { date: '2026-10-01', count: 3 },
        { date: '2026-10-02', count: null },
      ]
    )
    expect(csv).toBe('date,count\r\n2026-10-01,3\r\n2026-10-02,\r\n')
  })
})

describe('buildReportRows', () => {
  it('returns deterministic, type-specific rows capped by row_count', () => {
    const a = buildReportRows(REPORT)
    const b = buildReportRows(REPORT)
    expect(a).toEqual(b)
    expect(a.columns).toEqual(['date', 'app_key', 'signups'])
    expect(a.rows).toHaveLength(5)
    expect(a.rows.every((r) => r.app_key === 'stoktok')).toBe(true)
    expect(a.rows[0].date).toBe('2026-10-01')
  })

  it('caps the mock output at 20 rows', () => {
    const { rows } = buildReportRows({ ...REPORT, row_count: 5000 })
    expect(rows).toHaveLength(20)
  })
})

describe('reportFileName / canDownload', () => {
  it('slugifies the report name', () => {
    expect(reportFileName(REPORT)).toBe('sign-ups-q4-board.csv')
    expect(reportFileName({ ...REPORT, name: '***' })).toBe('report.csv')
  })

  it('only allows downloading finished runs', () => {
    expect(canDownload(REPORT)).toBe(true)
    expect(canDownload({ ...REPORT, status: 'running' })).toBe(false)
    expect(canDownload({ ...REPORT, status: 'failed' })).toBe(false)
    expect(canDownload({ ...REPORT, last_run_at: null })).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import indexHtml from '../../index.html?raw'
import './fonts'
import themeCss from './theme.css?raw'

describe('self-hosted fonts', () => {
  it('index.html has no Google Fonts hosts', () => {
    expect(indexHtml).not.toMatch(/fonts\.(googleapis|gstatic)\.com/)
  })

  it('theme maps font-inter / font-manrope to the self-hosted families', () => {
    expect(themeCss).toContain("--font-inter: 'Inter Variable',")
    expect(themeCss).toContain("--font-manrope: 'Manrope Variable',")
    expect(themeCss).not.toMatch(/'sans-serif'/)
  })

  it('registers Inter Variable upright and italic, and Manrope Variable', async () => {
    for (const w of [400, 500, 600, 700]) {
      expect(
        (await document.fonts.load(`${w} 16px "Inter Variable"`)).length
      ).toBeGreaterThan(0)
      expect(
        (await document.fonts.load(`${w} 16px "Manrope Variable"`)).length
      ).toBeGreaterThan(0)
    }
    const italic = await document.fonts.load('italic 400 16px "Inter Variable"')
    expect(italic.length).toBeGreaterThan(0)
    expect(italic[0].style).toBe('italic')
  })
})

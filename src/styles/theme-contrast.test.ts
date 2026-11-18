import { describe, expect, it } from 'vitest'
import theme from './theme.css?raw'

type Rgb = [number, number, number]

// OKLCH -> linear sRGB (Ottosson's OKLab matrices).
function oklchToLinear(l: number, c: number, h: number): Rgb {
  const a = c * Math.cos((h * Math.PI) / 180)
  const b = c * Math.sin((h * Math.PI) / 180)
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  const clamp = (x: number) => Math.min(1, Math.max(0, x))
  return [
    clamp(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
    clamp(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
    clamp(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_),
  ]
}

const luminance = ([r, g, b]: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b
const contrast = (x: Rgb, y: Rgb) => {
  const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p)
  return (hi + 0.05) / (lo + 0.05)
}

function block(selector: string) {
  const start = theme.indexOf(`${selector} {`)
  return theme.slice(start, theme.indexOf('}', start))
}

function token(css: string, name: string, over?: Rgb): Rgb {
  const m = new RegExp(
    `${name}:\\s*oklch\\(([\\d.]+) ([\\d.]+) ([\\d.]+)(?: / ([\\d.]+)%)?\\)`
  ).exec(css)
  if (!m) throw new Error(`${name} not found`)
  const rgb = oklchToLinear(+m[1], +m[2], +m[3])
  const alpha = m[4] === undefined ? 1 : +m[4] / 100
  if (alpha === 1 || !over) return rgb
  return rgb.map((v, i) => v * alpha + over[i] * (1 - alpha)) as Rgb
}

describe.each([
  ['light', ':root'],
  ['dark', '.dark'],
])('theme tokens (%s)', (_name, selector) => {
  const css = block(selector)
  const background = token(css, '--background')
  const input = token(css, '--input', background)
  const ring = token(css, '--ring', background)

  it('--input is at least 3:1 on --background', () => {
    expect(contrast(input, background)).toBeGreaterThanOrEqual(3)
  })

  it('--ring is at least 3:1 on --background and stronger than --input', () => {
    expect(contrast(ring, background)).toBeGreaterThanOrEqual(3)
    expect(contrast(ring, background)).toBeGreaterThan(
      contrast(input, background)
    )
  })
})

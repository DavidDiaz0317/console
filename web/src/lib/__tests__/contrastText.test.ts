import { describe, expect, it } from 'vitest'
import {
  DARK_TEXT_CLASS,
  DEFAULT_SURFACE_COLOR,
  getCompositeRelativeLuminance,
  getContrastTextColor,
  getRelativeLuminance,
  LIGHT_TEXT_CLASS,
  LUMINANCE_THRESHOLD,
} from '../contrastText'

describe('contrastText', () => {
  it('uses light text for dark hex backgrounds', () => {
    expect(getContrastTextColor('#9333ea')).toBe(LIGHT_TEXT_CLASS)
  })

  it('uses dark text for bright hex backgrounds', () => {
    expect(getContrastTextColor('#fef08a')).toBe(DARK_TEXT_CLASS)
  })

  it('parses rgb backgrounds when choosing text color', () => {
    expect(getContrastTextColor('rgb(17, 24, 39)')).toBe(LIGHT_TEXT_CLASS)
    expect(getContrastTextColor('rgba(250, 204, 21, 0.9)')).toBe(DARK_TEXT_CLASS)
  })

  it('keeps low-opacity warm overlays readable on the dark glass surface', () => {
    expect(getContrastTextColor('#facc15', 0.15)).toBe(LIGHT_TEXT_CLASS)
    expect(getCompositeRelativeLuminance('#facc15', 0.15, DEFAULT_SURFACE_COLOR)).not.toBeNull()
  })

  it('returns null luminance for unsupported color formats', () => {
    expect(getRelativeLuminance('hsl(0 0% 0%)')).toBeNull()
  })

  it('keeps the luminance threshold as a named constant', () => {
    expect(LUMINANCE_THRESHOLD).toBe(0.5)
  })
})

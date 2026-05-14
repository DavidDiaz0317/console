const RGB_HEX_LENGTH = 6
const SHORT_RGB_HEX_LENGTH = 3
const RGBA_HEX_LENGTH = 8
const SHORT_RGBA_HEX_LENGTH = 4
const RGB_CHANNEL_COUNT = 3
const MAX_RGB_CHANNEL = 255
const MIN_ALPHA = 0
const MAX_ALPHA = 1
const LUMINANCE_THRESHOLD = 0.5
const LIGHT_TEXT_CLASS = 'text-white'
const DARK_TEXT_CLASS = 'text-gray-900'
const DEFAULT_SURFACE_COLOR = 'rgb(17, 24, 39)'
const RGB_FUNCTION_PATTERN = /^rgba?\(([^)]+)\)$/i

interface RgbColor {
  red: number
  green: number
  blue: number
}

function normalizeHexColor(bgColor: string): string | null {
  const normalized = bgColor.trim().replace(/^#/, '')

  if (normalized.length === SHORT_RGB_HEX_LENGTH || normalized.length === SHORT_RGBA_HEX_LENGTH) {
    return normalized
      .slice(0, SHORT_RGB_HEX_LENGTH)
      .split('')
      .map(channel => `${channel}${channel}`)
      .join('')
  }

  if (normalized.length === RGB_HEX_LENGTH || normalized.length === RGBA_HEX_LENGTH) {
    return normalized.slice(0, RGB_HEX_LENGTH)
  }

  return null
}

function parseHexColor(bgColor: string): RgbColor | null {
  const normalized = normalizeHexColor(bgColor)
  if (!normalized || !/^[0-9a-f]{6}$/i.test(normalized)) return null

  return {
    red: Number.parseInt(normalized.slice(0, 2), 16),
    green: Number.parseInt(normalized.slice(2, 4), 16),
    blue: Number.parseInt(normalized.slice(4, 6), 16),
  }
}

function parseRgbColor(bgColor: string): RgbColor | null {
  const match = bgColor.trim().match(RGB_FUNCTION_PATTERN)
  if (!match) return null

  const channels = match[1]
    .split(',')
    .slice(0, RGB_CHANNEL_COUNT)
    .map(channel => Number.parseFloat(channel.trim()))

  if (channels.length !== RGB_CHANNEL_COUNT || channels.some(channel => Number.isNaN(channel))) {
    return null
  }

  return {
    red: Math.max(0, Math.min(MAX_RGB_CHANNEL, channels[0])),
    green: Math.max(0, Math.min(MAX_RGB_CHANNEL, channels[1])),
    blue: Math.max(0, Math.min(MAX_RGB_CHANNEL, channels[2])),
  }
}

function parseColor(bgColor: string): RgbColor | null {
  return parseHexColor(bgColor) ?? parseRgbColor(bgColor)
}

function toLinearLuminance(channel: number): number {
  const normalized = channel / MAX_RGB_CHANNEL
  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4
}

function clampAlpha(alpha: number): number {
  return Math.max(MIN_ALPHA, Math.min(MAX_ALPHA, alpha))
}

function blendChannel(foreground: number, background: number, alpha: number): number {
  return (foreground * alpha) + (background * (MAX_ALPHA - alpha))
}

function blendColors(foregroundColor: RgbColor, backgroundColor: RgbColor, alpha: number): RgbColor {
  const blendedAlpha = clampAlpha(alpha)
  return {
    red: blendChannel(foregroundColor.red, backgroundColor.red, blendedAlpha),
    green: blendChannel(foregroundColor.green, backgroundColor.green, blendedAlpha),
    blue: blendChannel(foregroundColor.blue, backgroundColor.blue, blendedAlpha),
  }
}

export function getRelativeLuminance(bgColor: string): number | null {
  const color = parseColor(bgColor)
  if (!color) return null

  return (0.2126 * toLinearLuminance(color.red))
    + (0.7152 * toLinearLuminance(color.green))
    + (0.0722 * toLinearLuminance(color.blue))
}

export function getCompositeRelativeLuminance(
  overlayColor: string,
  overlayOpacity = MAX_ALPHA,
  surfaceColor = DEFAULT_SURFACE_COLOR,
): number | null {
  const foreground = parseColor(overlayColor)
  const background = parseColor(surfaceColor)
  if (!foreground || !background) return null

  const composite = blendColors(foreground, background, overlayOpacity)
  return (0.2126 * toLinearLuminance(composite.red))
    + (0.7152 * toLinearLuminance(composite.green))
    + (0.0722 * toLinearLuminance(composite.blue))
}

export function getContrastTextColor(
  bgColor: string,
  opacity = MAX_ALPHA,
  surfaceColor = DEFAULT_SURFACE_COLOR,
): string {
  const luminance = getCompositeRelativeLuminance(bgColor, opacity, surfaceColor)
  if (luminance === null || luminance < LUMINANCE_THRESHOLD) return LIGHT_TEXT_CLASS
  return DARK_TEXT_CLASS
}

export { DARK_TEXT_CLASS, DEFAULT_SURFACE_COLOR, LIGHT_TEXT_CLASS, LUMINANCE_THRESHOLD }

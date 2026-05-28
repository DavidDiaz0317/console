/**
 * sanitizeInput — Strips HTML tags and control characters from user input
 * to prevent XSS when user-provided text is interpolated into UI labels
 * or AI prompt titles.
 *
 * This does NOT attempt full prompt-injection prevention (which is an
 * unsolvable problem for free-form AI prompts) but it ensures that:
 *  1. No HTML/SVG markup flows into any rendering context
 *  2. Unicode obfuscation attempts (e.g. \u003c) are neutralized
 *  3. Input is length-capped to prevent abuse
 *
 * Addresses #15903 — unsanitized search input in AI mission prompt/title.
 */

/** Maximum length for a mission title derived from user search input. */
const MAX_MISSION_TITLE_LENGTH = 120

/** Maximum length for a prompt derived from user search input. */
const MAX_SEARCH_PROMPT_LENGTH = 2000

/**
 * Strip HTML/XML tags, embedded control characters, and Unicode-escaped
 * angle brackets from a user-provided string.
 */
function stripTags(input: string): string {
  return input
    // Decode common Unicode escape forms for angle brackets
    .replace(/\\u003c/gi, '<')
    .replace(/\\u003e/gi, '>')
    .replace(/&#x3c;?/gi, '<')
    .replace(/&#x3e;?/gi, '>')
    .replace(/&#60;?/g, '<')
    .replace(/&#62;?/g, '>')
    // Strip all HTML/XML tags
    .replace(/<[^>]*>/g, '')
    // Remove embedded control characters (NUL through US, and DEL)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, '')
}

/**
 * Sanitize user input for use as a mission title.
 * Strips HTML, trims whitespace, and enforces a length cap.
 */
export function sanitizeMissionTitle(input: string): string {
  const cleaned = stripTags(input).trim()
  if (cleaned.length <= MAX_MISSION_TITLE_LENGTH) return cleaned
  return cleaned.substring(0, MAX_MISSION_TITLE_LENGTH - 3) + '...'
}

/**
 * Sanitize user input for use as a mission prompt from search.
 * Strips HTML tags (the prompt is plain text, not markup) and caps length.
 */
export function sanitizeSearchPrompt(input: string): string {
  const cleaned = stripTags(input).trim()
  if (cleaned.length <= MAX_SEARCH_PROMPT_LENGTH) return cleaned
  return cleaned.substring(0, MAX_SEARCH_PROMPT_LENGTH)
}

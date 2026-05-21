/**
 * Netlify Function: GA4 gtag.js Proxy
 *
 * Serves gtag.js from the console's own domain (/api/gtag) so that
 * domain-based ad blockers don't block it. This is the Netlify equivalent
 * of the Go backend's GA4ScriptProxy handler.
 *
 * Without this, Netlify visitors fall back to the Google CDN
 * (googletagmanager.com) which is on virtually every ad blocker's
 * blocklist. When gtag.js can't load, events go through the custom
 * proxy (/api/m) which only appears in standard reports — NOT Realtime.
 *
 * With this function, gtag.js loads from console.kubestellar.io/api/gtag
 * (same origin), events go directly from browser to GA4, and visitors
 * appear in GA4 Realtime reports with accurate deployment_type.
 */

import type { Config } from "@netlify/functions"

const GTAG_BASE_URL = "https://www.googletagmanager.com/gtag/js"
const CACHE_MAX_AGE_SECS = 3600 // 1 hour — matches Go backend
const MAX_PROXY_RESPONSE_BYTES = 1_048_576
const OVERSIZED_RESPONSE_ERROR = "Upstream too large"

async function readResponseTextWithCap(response: Response, maxBytes: number): Promise<string> {
  const contentLengthHeader = response.headers.get("content-length")
  if (contentLengthHeader) {
    const contentLength = Number.parseInt(contentLengthHeader, 10)
    if (!Number.isNaN(contentLength) && contentLength > maxBytes) {
      throw new Error(OVERSIZED_RESPONSE_ERROR)
    }
  }

  if (!response.body) {
    return ""
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let totalSize = 0
  let text = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    if (!value) {
      continue
    }

    totalSize += value.byteLength
    if (totalSize > maxBytes) {
      await reader.cancel(OVERSIZED_RESPONSE_ERROR)
      throw new Error(OVERSIZED_RESPONSE_ERROR)
    }

    text += decoder.decode(value, { stream: true })
  }

  return text + decoder.decode()
}

export default async (req: Request) => {
  const url = new URL(req.url)
  const queryString = url.search || ""

  // Proxy the request to Google Tag Manager, preserving query params (e.g. ?id=G-...)
  const targetUrl = `${GTAG_BASE_URL}${queryString}`

  try {
    const resp = await fetch(targetUrl, {
      headers: {
        "User-Agent": req.headers.get("user-agent") || "",
      },
      signal: AbortSignal.timeout(10_000),
    })

    if (!resp.ok) {
      return new Response(null, { status: resp.status })
    }

    const body = await readResponseTextWithCap(resp, MAX_PROXY_RESPONSE_BYTES)

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": `public, max-age=${CACHE_MAX_AGE_SECS}`,
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === OVERSIZED_RESPONSE_ERROR) {
      return new Response(OVERSIZED_RESPONSE_ERROR, { status: 502 })
    }

    return new Response(null, { status: 502 })
  }
}

export const config: Config = {
  path: "/api/gtag",
}

/**
 * Netlify Function: YouTube Playlist
 *
 * Fetches videos from the KubeStellar Console YouTube playlist RSS feed
 * and returns them as JSON. Equivalent to the Go backend's
 * YouTubePlaylistHandler for Netlify deployments.
 */

import { buildCorsHeaders, handlePreflight } from "./_shared"

const PLAYLIST_ID = "PL1ALKGr_qZKc-xehA_8iUCdiKsCo6p6nD";
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?playlist_id=${PLAYLIST_ID}`;
const MAX_UPSTREAM_RESPONSE_BYTES = 1_048_576;
const OVERSIZED_RESPONSE_ERROR = "Upstream too large";

interface PlaylistVideo {
  id: string;
  title: string;
  description?: string;
  published?: string;
}

async function readResponseTextWithCap(response: Response, maxBytes: number): Promise<string> {
  const contentLengthHeader = response.headers.get("content-length");
  if (contentLengthHeader) {
    const contentLength = Number.parseInt(contentLengthHeader, 10);
    if (!Number.isNaN(contentLength) && contentLength > maxBytes) {
      throw new Error(OVERSIZED_RESPONSE_ERROR);
    }
  }

  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalSize = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }

    totalSize += value.byteLength;
    if (totalSize > maxBytes) {
      await reader.cancel(OVERSIZED_RESPONSE_ERROR);
      throw new Error(OVERSIZED_RESPONSE_ERROR);
    }

    text += decoder.decode(value, { stream: true });
  }

  return text + decoder.decode();
}

async function readResponseJsonWithCap<T>(response: Response, maxBytes: number): Promise<T> {
  return JSON.parse(await readResponseTextWithCap(response, maxBytes)) as T;
}

function parseAtomFeed(xml: string): PlaylistVideo[] {
  const videos: PlaylistVideo[] = [];

  // Simple XML parsing without a library — extract <entry> blocks
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;

  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];

    const videoId = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1] ?? "";
    const title = entry.match(/<title>([^<]+)<\/title>/)?.[1] ?? "";
    const description = entry.match(/<media:description>([^<]*)<\/media:description>/)?.[1] ?? "";
    const published = entry.match(/<published>([^<]+)<\/published>/)?.[1] ?? "";

    if (videoId) {
      videos.push({
        id: videoId,
        title,
        description: description || undefined,
        published: published || undefined,
      });
    }
  }

  return videos;
}

export default async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req, {
    methods: "GET, OPTIONS",
  });
  const headers = {
    ...corsHeaders,
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=300",
  };

  if (req.method === "OPTIONS") {
    return handlePreflight(req, {
      methods: "GET, OPTIONS",
    });
  }

  try {
    // Primary: Invidious API (reliable, no auth required)
    const invidiousInstances = [
      "https://inv.nadeko.net",
      "https://invidious.fdn.fr",
      "https://vid.puffyan.us",
    ];

    for (const instance of invidiousInstances) {
      try {
        const invResp = await fetch(
          `${instance}/api/v1/playlists/${PLAYLIST_ID}`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (invResp.ok) {
          const data = await readResponseJsonWithCap<{ videos?: Array<{ videoId: string; title: string }> }>(
            invResp,
            MAX_UPSTREAM_RESPONSE_BYTES
          );
          if (data.videos && data.videos.length > 0) {
            const videos: PlaylistVideo[] = data.videos.map((v) => ({
              id: v.videoId,
              title: v.title,
            }));
            return new Response(
              JSON.stringify({
                videos,
                playlistId: PLAYLIST_ID,
                playlistUrl: `https://www.youtube.com/playlist?list=${PLAYLIST_ID}`,
              }),
              { status: 200, headers }
            );
          }
        }
      } catch {
        // try next instance
      }
    }

    // Fallback: RSS feed
    const resp = await fetch(FEED_URL, {
      headers: { "User-Agent": "KubeStellar-Console/1.0" },
      signal: AbortSignal.timeout(10_000),
    });

    if (resp.ok) {
      const xml = await readResponseTextWithCap(resp, MAX_UPSTREAM_RESPONSE_BYTES);
      const videos = parseAtomFeed(xml);
      if (videos.length > 0) {
        return new Response(
          JSON.stringify({
            videos,
            playlistId: PLAYLIST_ID,
            playlistUrl: `https://www.youtube.com/playlist?list=${PLAYLIST_ID}`,
          }),
          { status: 200, headers }
        );
      }
    }

    // All sources failed
    return new Response(
      JSON.stringify({ error: "All video sources unavailable", videos: [] }),
      { status: 502, headers }
    );
  } catch (err) {
    if (err instanceof Error && err.message === OVERSIZED_RESPONSE_ERROR) {
      return new Response(
        JSON.stringify({ error: OVERSIZED_RESPONSE_ERROR }),
        { status: 502, headers }
      );
    }

    console.error("Failed to fetch YouTube playlist:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 502, headers }
    );
  }
};

export const config = {
  path: "/api/youtube/playlist",
};

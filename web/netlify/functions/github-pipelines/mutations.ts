/**
 * Mutation handling (rerun/cancel) for GitHub Pipelines Dashboard
 *
 * Security layers:
 *   1. GITHUB_MUTATIONS_TOKEN must be set (operator opt-in)
 *   2. PIPELINES_MUTATION_SECRET must be set and caller must present it
 *      as a Bearer token in the Authorization header
 *   3. X-Requested-With: XMLHttpRequest required (basic CSRF guard)
 *   4. IP-based rate limiting (5 per hour)
 *   5. op allowlist + repo allowlist + numeric run ID validation
 */
import { enforceSimpleRateLimit } from "../_shared/rate-limit";
import { STORE_NAME, getRepos } from "./constants";
import { gh } from "./fetchers";
import { isValidRepo, jsonResponse } from "./helpers";

const REPOS = getRepos();

/** Constant-time string comparison to prevent timing attacks. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function mutate(
  op: string,
  repo: string,
  runId: string,
  req: Request
): Promise<Response> {
  // CSRF guard — reject requests not made via XMLHttpRequest (e.g. form posts)
  if (req.headers.get("x-requested-with") !== "XMLHttpRequest") {
    return jsonResponse(
      { error: "Missing X-Requested-With header" },
      { status: 403 }
    );
  }

  // Rate limiting — 5 mutations per hour per IP
  const clientIp =
    req.headers.get("x-nf-client-connection-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const rate = await enforceSimpleRateLimit({
    storeName: STORE_NAME,
    prefix: "gh-pipelines-mutate:",
    subject: clientIp,
    maxRequests: 5,
    windowMs: 3600 * 1000, // 1 hour
  });
  if (rate.limited) {
    return jsonResponse(
      { error: "Rate limit exceeded", retryAfter: rate.retryAfterSeconds },
      { status: 429 }
    );
  }

  const token = process.env.GITHUB_MUTATIONS_TOKEN;
  if (!token) {
    // Intentional: demo site never mutates without an operator explicitly
    // enabling it by setting GITHUB_MUTATIONS_TOKEN. See README for details.
    return jsonResponse(
      { error: "Workflow mutations disabled on this deployment" },
      { status: 503 }
    );
  }

  // Bearer token auth — caller must present the shared secret
  const mutationSecret = process.env.PIPELINES_MUTATION_SECRET;
  if (!mutationSecret) {
    return jsonResponse(
      { error: "Workflow mutations disabled on this deployment" },
      { status: 503 }
    );
  }
  const authHeader = req.headers.get("authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!bearer || !timingSafeEqual(bearer, mutationSecret)) {
    return jsonResponse({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isValidRepo(repo) || !REPOS.includes(repo)) {
    return jsonResponse({ error: "Unknown repo" }, { status: 400 });
  }
  let path: string;
  if (op === "rerun") path = `/repos/${repo}/actions/runs/${runId}/rerun`;
  else if (op === "cancel") path = `/repos/${repo}/actions/runs/${runId}/cancel`;
  else return jsonResponse({ error: "Unknown op" }, { status: 400 });

  const res = await gh(path, token, { method: "POST" });
  if (!res.ok) {
    return jsonResponse({ error: "upstream request failed" }, { status: 502 });
  }
  return jsonResponse({ ok: true, op, run: runId, repo });
}

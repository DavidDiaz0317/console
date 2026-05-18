/**
 * Shared types, constants, and utilities for the GitHub Pipelines Netlify function.
 * Extracted from github-pipelines.mts to reduce file size.
 */
import { getStore } from "@netlify/blobs";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const GITHUB_API = "https://api.github.com";

export const STORE_NAME = "github-pipelines-cache";

export const HISTORY_KEY = "history-v1";

export const CACHE_TTL_MS = 120_000; // 2 min

export const HISTORY_RETENTION_DAYS = 90;

export const MS_PER_DAY = 86_400_000;

export const PR_FROM_COMMIT_RE = /\(#(\d+)\)\s*$/;

const ALLOWED_ORIGINS = [
  "https://console.kubestellar.io",
  "https://kubestellar.io",
  "https://www.kubestellar.io",
];

const GH_RETRY_MAX_ATTEMPTS = 3;
const GH_RETRY_BASE_DELAY_MS = 1_000;

const VALID_REPO_PATTERN = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Conclusion =
  | "success"
  | "failure"
  | "cancelled"
  | "skipped"
  | "timed_out"
  | "action_required"
  | "neutral"
  | "stale"
  | null;

export type Status = "queued" | "in_progress" | "completed" | "waiting" | "pending";

export interface PullRequestRef {
  number: number;
  url: string;
}

export interface WorkflowRun {
  id: number;
  repo: string;
  name: string;
  workflowId: number;
  headBranch: string;
  status: Status;
  conclusion: Conclusion;
  event: string;
  runNumber: number;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
  pullRequests?: PullRequestRef[];
}

export interface JobStep {
  name: string;
  status: Status;
  conclusion: Conclusion;
  number: number;
  startedAt?: string;
  completedAt?: string;
}

export interface Job {
  id: number;
  name: string;
  status: Status;
  conclusion: Conclusion;
  startedAt: string | null;
  completedAt: string | null;
  htmlUrl: string;
  steps: JobStep[];
}

export interface CachedView<T> {
  payload: T;
  fetchedAt: number;
}

/** Rolling long-term history, keyed by repo → workflow → YYYY-MM-DD */
export interface HistoryBlob {
  /** ISO string of the most recent write — used for cache-coherence */
  updatedAt: string;
  /** repo/owner → workflow name → date → summary */
  days: Record<string, Record<string, Record<string, HistoryDay>>>;
}

export interface HistoryDay {
  runId: number;
  conclusion: Conclusion;
  htmlUrl: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function corsOrigin(origin: string | null): string {
  if (!origin) return ALLOWED_ORIGINS[0];
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  try {
    const host = new URL(origin).hostname.toLowerCase();
    if (host === "kubestellar.io" || host.endsWith(".kubestellar.io")) {
      return origin;
    }
    if (host === "localhost") return origin;
  } catch {
    // Malformed origin — fall through to default
  }
  return ALLOWED_ORIGINS[0];
}

export function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {}
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

/** GitHub API fetch with auth + retry on 429/403 */
export async function gh(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  const url = path.startsWith("http") ? path : `${GITHUB_API}${path}`;
  const headers = {
    Accept: "application/vnd.github.v3+json",
    Authorization: `Bearer ${token}`,
    ...(init.headers ?? {}),
  };
  for (let attempt = 0; attempt < GH_RETRY_MAX_ATTEMPTS; attempt++) {
    const resp = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(10_000) });
    if (resp.status !== 429 && resp.status !== 403) return resp;
    if (attempt === GH_RETRY_MAX_ATTEMPTS - 1) {
      console.warn(`[github-pipelines] retries exhausted for ${path}, status=${resp.status}`);
      return resp;
    }
    const retryAfter = resp.headers.get("Retry-After");
    const waitMs = retryAfter
      ? Math.min(parseInt(retryAfter, 10) * 1000, 10_000)
      : GH_RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
    await new Promise((r) => setTimeout(r, waitMs));
  }
  // Unreachable — loop always returns, but TS needs this
  throw new Error("gh: unreachable");
}

export function isValidRepo(repo: string | null): boolean {
  return !!repo && VALID_REPO_PATTERN.test(repo);
}

/** YYYY-MM-DD in UTC */
export function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/** Map GitHub's workflow_run shape to our WorkflowRun type */
export function normalizeRun(r: Record<string, unknown>, repo: string): WorkflowRun {
  let rawPRs = Array.isArray(r.pull_requests)
    ? (r.pull_requests as Array<{ number?: number; url?: string }>)
      .filter((pr) => typeof pr.number === "number")
      .map((pr) => ({ number: pr.number!, url: String(pr.url ?? "") }))
    : undefined;
  // For push events (merge commits), the pull_requests array is empty.
  // Extract the PR number from the commit message pattern "feat: … (#1234)".
  if ((!rawPRs || rawPRs.length === 0) && r.event === "push") {
    const headCommit = r.head_commit as { message?: string } | undefined;
    const msg = headCommit?.message ?? "";
    const m = PR_FROM_COMMIT_RE.exec(msg);
    if (m) {
      const num = Number(m[1]);
      if (num > 0) {
        rawPRs = [{ number: num, url: `https://github.com/${repo}/pull/${num}` }];
      }
    }
  }
  return {
    id: Number(r.id),
    repo,
    name: String(r.name ?? ""),
    workflowId: Number(r.workflow_id ?? 0),
    headBranch: String(r.head_branch ?? ""),
    status: (r.status as Status) ?? "completed",
    conclusion: (r.conclusion as Conclusion) ?? null,
    event: String(r.event ?? ""),
    runNumber: Number(r.run_number ?? 0),
    htmlUrl: String(r.html_url ?? ""),
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
    pullRequests: rawPRs?.length ? rawPRs : undefined,
  };
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

export async function readCache<T>(
  store: ReturnType<typeof getStore>,
  key: string
): Promise<CachedView<T> | null> {
  try {
    const raw = await store.get(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedView<T>;
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeCache<T>(
  store: ReturnType<typeof getStore>,
  key: string,
  payload: T
): Promise<void> {
  const entry: CachedView<T> = { payload, fetchedAt: Date.now() };
  await store.set(key, JSON.stringify(entry));
}

export async function readHistory(
  store: ReturnType<typeof getStore>
): Promise<HistoryBlob> {
  try {
    const raw = await store.get(HISTORY_KEY);
    if (!raw) return { updatedAt: new Date(0).toISOString(), days: {} };
    return JSON.parse(raw) as HistoryBlob;
  } catch {
    return { updatedAt: new Date(0).toISOString(), days: {} };
  }
}

export async function writeHistory(
  store: ReturnType<typeof getStore>,
  history: HistoryBlob
): Promise<void> {
  // Trim to retention window
  const cutoff = new Date(Date.now() - HISTORY_RETENTION_DAYS * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
  for (const repo of Object.keys(history.days)) {
    for (const wf of Object.keys(history.days[repo])) {
      for (const d of Object.keys(history.days[repo][wf])) {
        if (d < cutoff) delete history.days[repo][wf][d];
      }
    }
  }
  history.updatedAt = new Date().toISOString();
  await store.set(HISTORY_KEY, JSON.stringify(history));
}

/** Merge a batch of runs into the history blob. Newest run per day wins. */
export function mergeIntoHistory(history: HistoryBlob, runs: WorkflowRun[]): void {
  for (const run of runs) {
    const day = dayKey(run.createdAt);
    if (!day) continue;
    const byRepo = (history.days[run.repo] ??= {});
    const byWf = (byRepo[run.name] ??= {});
    const existing = byWf[day];
    // When conclusion is null but status indicates activity, surface
    // "in_progress" so the matrix renders a blue dot, not grey.
    const conclusion: Conclusion =
      run.conclusion === null && (run.status === "in_progress" || run.status === "queued")
        ? "in_progress" as Conclusion
        : run.conclusion;
    // Newer run wins (higher ID ≈ newer). Failure trumps success for the same day
    // if one of the runs failed — CI health signal matters more than "latest".
    if (!existing || run.id > existing.runId) {
      byWf[day] = {
        runId: run.id,
        conclusion,
        htmlUrl: run.htmlUrl,
      };
    }
  }
}

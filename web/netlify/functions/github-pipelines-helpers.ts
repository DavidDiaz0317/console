import { enforceSimpleRateLimit } from "./_shared/rate-limit";
import type {
  CachedView,
  Conclusion,
  HistoryBlob,
  PipelineStore,
  Status,
  WorkflowRun,
} from "./github-pipelines-types";

const GITHUB_API = "https://api.github.com";

export const STORE_NAME = "github-pipelines-cache";
const HISTORY_KEY = "history-v1";
export const CACHE_TTL_MS = 120_000;
export const MATRIX_DEFAULT_DAYS = 14;
export const MATRIX_MAX_DAYS = 90;
const HISTORY_RETENTION_DAYS = 90;
export const FAILURES_LIMIT = 10;
export const FAILURES_OVERFETCH = 30;
export const LOG_TAIL_LINES = 500;
export const MATRIX_RUNS_PER_REPO = 200;
export const FLOW_MAX_RUNS_PER_REPO = 8;
const DEFAULT_REPOS = [
  "kubestellar/console",
  "kubestellar/docs",
  "kubestellar/console-kb",
  "kubestellar/kubestellar-mcp",
  "kubestellar/console-marketplace",
  "kubestellar/homebrew-tap",
];
export const NIGHTLY_RELEASE_REPO = "kubestellar/console";
export const NIGHTLY_RELEASE_WORKFLOW = "release.yml";
export const RELEASE_OVERFETCH = 10;
export const NIGHTLY_TAG_RE = /nightly/i;
const PR_FROM_COMMIT_RE = /\(#(\d+)\)\s*$/;
export const MS_PER_DAY = 86_400_000;

const ALLOWED_ORIGINS = [
  "https://console.kubestellar.io",
  "https://kubestellar.io",
  "https://www.kubestellar.io",
];

function getRepos(): string[] {
  const env = process.env.PIPELINE_REPOS;
  if (!env) return DEFAULT_REPOS;
  return env.split(",").map((s) => s.trim()).filter(Boolean);
}

export const REPOS = getRepos();

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

const GH_RETRY_MAX_ATTEMPTS = 3;
const GH_RETRY_BASE_DELAY_MS = 1_000;

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
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  throw new Error("unreachable");
}

const VALID_REPO_PATTERN = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;

export function isValidRepo(repo: string | null): boolean {
  return !!repo && VALID_REPO_PATTERN.test(repo);
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export function normalizeRun(r: Record<string, unknown>, repo: string): WorkflowRun {
  let rawPRs = Array.isArray(r.pull_requests)
    ? (r.pull_requests as Array<{ number?: number; url?: string }>)
        .filter((pr) => typeof pr.number === "number")
        .map((pr) => ({ number: pr.number!, url: String(pr.url ?? "") }))
    : undefined;
  if ((!rawPRs || rawPRs.length === 0) && r.event === "push") {
    const headCommit = r.head_commit as { message?: string } | undefined;
    const msg = headCommit?.message ?? "";
    const match = PR_FROM_COMMIT_RE.exec(msg);
    if (match) {
      const num = Number(match[1]);
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

export async function readCache<T>(store: PipelineStore, key: string): Promise<CachedView<T> | null> {
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

export async function writeCache<T>(store: PipelineStore, key: string, payload: T): Promise<void> {
  const entry: CachedView<T> = { payload, fetchedAt: Date.now() };
  await store.set(key, JSON.stringify(entry));
}

export async function readHistory(store: PipelineStore): Promise<HistoryBlob> {
  try {
    const raw = await store.get(HISTORY_KEY);
    if (!raw) return { updatedAt: new Date(0).toISOString(), days: {} };
    return JSON.parse(raw) as HistoryBlob;
  } catch {
    return { updatedAt: new Date(0).toISOString(), days: {} };
  }
}

export async function writeHistory(store: PipelineStore, history: HistoryBlob): Promise<void> {
  const cutoff = new Date(Date.now() - HISTORY_RETENTION_DAYS * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
  for (const repo of Object.keys(history.days)) {
    for (const workflow of Object.keys(history.days[repo])) {
      for (const date of Object.keys(history.days[repo][workflow])) {
        if (date < cutoff) delete history.days[repo][workflow][date];
      }
    }
  }
  history.updatedAt = new Date().toISOString();
  await store.set(HISTORY_KEY, JSON.stringify(history));
}

export function mergeIntoHistory(history: HistoryBlob, runs: WorkflowRun[]): void {
  for (const run of runs) {
    const day = dayKey(run.createdAt);
    if (!day) continue;
    const byRepo = (history.days[run.repo] ??= {});
    const byWorkflow = (byRepo[run.name] ??= {});
    const existing = byWorkflow[day];
    const conclusion: Conclusion =
      run.conclusion === null && (run.status === "in_progress" || run.status === "queued")
        ? ("in_progress" as Conclusion)
        : run.conclusion;
    if (!existing || run.id > existing.runId) {
      byWorkflow[day] = {
        runId: run.id,
        conclusion,
        htmlUrl: run.htmlUrl,
      };
    }
  }
}

export async function mutate(
  op: string,
  repo: string,
  runId: string,
  req: Request
): Promise<Response> {
  const clientIp =
    req.headers.get("x-nf-client-connection-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const rate = await enforceSimpleRateLimit({
    storeName: STORE_NAME,
    prefix: "gh-pipelines-mutate:",
    subject: clientIp,
    maxRequests: 5,
    windowMs: 3600 * 1000,
  });
  if (rate.limited) {
    return jsonResponse(
      { error: "Rate limit exceeded", retryAfter: rate.retryAfterSeconds },
      { status: 429 }
    );
  }

  const token = process.env.GITHUB_MUTATIONS_TOKEN;
  if (!token) {
    return jsonResponse(
      { error: "Workflow mutations disabled on this deployment" },
      { status: 503 }
    );
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

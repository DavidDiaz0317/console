import type {
  FailuresPayload,
  FailureRow,
  FlowPayload,
  FlowRun,
  Job,
  MatrixPayload,
  MatrixWorkflow,
  PipelineStore,
  PulsePayload,
  Status,
  Conclusion,
  WorkflowRun,
} from "./github-pipelines-types";
import {
  FAILURES_LIMIT,
  FAILURES_OVERFETCH,
  FLOW_MAX_RUNS_PER_REPO,
  LOG_TAIL_LINES,
  MATRIX_DEFAULT_DAYS,
  MATRIX_RUNS_PER_REPO,
  MS_PER_DAY,
  NIGHTLY_RELEASE_REPO,
  NIGHTLY_RELEASE_WORKFLOW,
  REPOS,
  gh,
  isValidRepo,
  jsonResponse,
  mergeIntoHistory,
  normalizeRun,
  readHistory,
  writeHistory,
} from "./github-pipelines-helpers";
import { fetchReleaseInfo } from "./github-pipelines-releases";

export async function buildPulse(
  store: PipelineStore,
  token: string,
  repoFilter: string | null
): Promise<PulsePayload> {
  const targetRepo = repoFilter && isValidRepo(repoFilter) ? repoFilter : NIGHTLY_RELEASE_REPO;
  const isDefault = targetRepo === NIGHTLY_RELEASE_REPO;
  const apiPath = isDefault
    ? `/repos/${targetRepo}/actions/workflows/${NIGHTLY_RELEASE_WORKFLOW}/runs?per_page=${MATRIX_DEFAULT_DAYS}`
    : `/repos/${targetRepo}/actions/runs?per_page=${MATRIX_DEFAULT_DAYS}`;
  const res = await gh(apiPath, token);
  if (!res.ok) throw new Error(`pulse: GitHub ${res.status}`);
  const data = (await res.json()) as { workflow_runs: Array<Record<string, unknown>> };
  const runs = (data.workflow_runs ?? []).map((run) => normalizeRun(run, targetRepo));
  mergeIntoHistory(await readHistory(store), runs);

  const { releaseTag, weeklyTag } = await fetchReleaseInfo(token, targetRepo);

  const last = runs[0];
  let streak = 0;
  let streakKind: "success" | "failure" | "mixed" = "mixed";
  if (last) {
    const kind: "success" | "failure" | null =
      last.conclusion === "success"
        ? "success"
        : last.conclusion === "failure" || last.conclusion === "timed_out"
          ? "failure"
          : null;
    if (kind) {
      streakKind = kind;
      for (const run of runs) {
        const conclusion =
          run.conclusion === "success"
            ? "success"
            : run.conclusion === "failure" || run.conclusion === "timed_out"
              ? "failure"
              : null;
        if (conclusion === kind) streak++;
        else break;
      }
    }
  }

  return {
    lastRun: last
      ? {
          conclusion: last.conclusion,
          createdAt: last.createdAt,
          htmlUrl: last.htmlUrl,
          runNumber: last.runNumber,
          releaseTag,
          weeklyTag,
        }
      : null,
    streak,
    streakKind,
    recent: runs
      .slice(0, MATRIX_DEFAULT_DAYS)
      .map((run) => ({
        conclusion: run.conclusion,
        createdAt: run.createdAt,
        htmlUrl: run.htmlUrl,
      })),
    nextCron: "0 5 * * *",
  };
}

export async function buildMatrix(
  store: PipelineStore,
  token: string,
  days: number,
  repoFilter: string | null
): Promise<MatrixPayload> {
  const targetRepos = repoFilter && isValidRepo(repoFilter) ? [repoFilter] : (REPOS as readonly string[]);
  const MAX_PER_PAGE = 100;
  const MAX_PAGES = 5;
  const freshRuns: WorkflowRun[] = [];

  for (const repo of targetRepos) {
    try {
      let fetched = 0;
      const pages = Math.min(Math.ceil(MATRIX_RUNS_PER_REPO / MAX_PER_PAGE), MAX_PAGES);
      for (let page = 1; page <= pages; page++) {
        const res = await gh(`/repos/${repo}/actions/runs?per_page=${MAX_PER_PAGE}&page=${page}`, token);
        if (!res.ok) break;
        const data = (await res.json()) as { workflow_runs: Array<Record<string, unknown>> };
        const runs = data.workflow_runs ?? [];
        for (const run of runs) {
          freshRuns.push(normalizeRun(run, repo));
        }
        fetched += runs.length;
        if (runs.length < MAX_PER_PAGE) break;
        if (fetched >= MATRIX_RUNS_PER_REPO) break;
      }
    } catch {
      // Per-repo fetch failures shouldn't nuke the whole matrix
    }
  }

  const history = await readHistory(store);
  mergeIntoHistory(history, freshRuns);
  await writeHistory(store, history).catch((err) => {
    console.warn(
      "[github-pipelines] history write failed:",
      err instanceof Error ? err.message : err
    );
  });

  const range: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    range.push(new Date(Date.now() - i * MS_PER_DAY).toISOString().slice(0, 10));
  }

  const workflows: MatrixWorkflow[] = [];
  for (const repo of targetRepos) {
    const workflowMap = history.days[repo] ?? {};
    for (const workflowName of Object.keys(workflowMap).sort()) {
      const byDate = workflowMap[workflowName];
      const cells = range.map((date) => ({
        date,
        conclusion: byDate[date]?.conclusion ?? null,
        htmlUrl: byDate[date]?.htmlUrl ?? "",
      }));
      if (cells.every((cell) => cell.conclusion === null)) continue;
      workflows.push({ repo, name: workflowName, cells });
    }
  }

  return { days, range, workflows };
}

export async function buildFlow(token: string, repoFilter: string | null): Promise<FlowPayload> {
  const targetRepos = repoFilter && isValidRepo(repoFilter) ? [repoFilter] : (REPOS as readonly string[]);
  const all: FlowRun[] = [];

  for (const repo of targetRepos) {
    try {
      const [inProgress, queued] = await Promise.all([
        gh(`/repos/${repo}/actions/runs?status=in_progress&per_page=${FLOW_MAX_RUNS_PER_REPO}`, token),
        gh(`/repos/${repo}/actions/runs?status=queued&per_page=${FLOW_MAX_RUNS_PER_REPO}`, token),
      ]);
      const merged: Record<string, unknown>[] = [];
      if (inProgress.ok) {
        const data = (await inProgress.json()) as { workflow_runs: Array<Record<string, unknown>> };
        merged.push(...(data.workflow_runs ?? []));
      }
      if (queued.ok) {
        const data = (await queued.json()) as { workflow_runs: Array<Record<string, unknown>> };
        merged.push(...(data.workflow_runs ?? []));
      }
      const runs = merged.map((run) => normalizeRun(run, repo));

      for (const run of runs) {
        const jobsRes = await gh(`/repos/${repo}/actions/runs/${run.id}/jobs`, token);
        if (!jobsRes.ok) continue;
        const jobsData = (await jobsRes.json()) as { jobs: Array<Record<string, unknown>> };
        const jobs: Job[] = (jobsData.jobs ?? []).map((job) => ({
          id: Number(job.id),
          name: String(job.name ?? ""),
          status: (job.status as Status) ?? "completed",
          conclusion: (job.conclusion as Conclusion) ?? null,
          startedAt: (job.started_at as string | null) ?? null,
          completedAt: (job.completed_at as string | null) ?? null,
          htmlUrl: String(job.html_url ?? ""),
          steps: ((job.steps as Array<Record<string, unknown>>) ?? []).map((step) => ({
            name: String(step.name ?? ""),
            status: (step.status as Status) ?? "completed",
            conclusion: (step.conclusion as Conclusion) ?? null,
            number: Number(step.number ?? 0),
            startedAt: (step.started_at as string | undefined) ?? undefined,
            completedAt: (step.completed_at as string | undefined) ?? undefined,
          })),
        }));
        all.push({ run, jobs });
      }
    } catch {
      // per-repo failure shouldn't block the rest
    }
  }

  all.sort((a, b) => (a.run.createdAt < b.run.createdAt ? 1 : -1));
  return { runs: all };
}

export async function buildFailures(
  token: string,
  repoFilter: string | null
): Promise<FailuresPayload> {
  const targetRepos = repoFilter && isValidRepo(repoFilter) ? [repoFilter] : (REPOS as readonly string[]);
  const rows: FailureRow[] = [];

  for (const repo of targetRepos) {
    try {
      const res = await gh(`/repos/${repo}/actions/runs?status=failure&per_page=${FAILURES_OVERFETCH}`, token);
      if (!res.ok) continue;
      const data = (await res.json()) as { workflow_runs: Array<Record<string, unknown>> };
      for (const raw of data.workflow_runs ?? []) {
        const run = normalizeRun(raw, repo);
        const created = new Date(run.createdAt).getTime();
        const updated = new Date(run.updatedAt).getTime();
        rows.push({
          repo,
          runId: run.id,
          workflow: run.name,
          htmlUrl: run.htmlUrl,
          branch: run.headBranch,
          event: run.event,
          conclusion: run.conclusion,
          createdAt: run.createdAt,
          durationMs: Math.max(0, updated - created),
          failedStep: null,
          pullRequests: run.pullRequests,
        });
      }
    } catch {
      // skip repo on error
    }
  }

  rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const top = rows.slice(0, FAILURES_LIMIT);

  await Promise.all(
    top.map(async (row) => {
      try {
        const res = await gh(`/repos/${row.repo}/actions/runs/${row.runId}/jobs`, token);
        if (!res.ok) return;
        const data = (await res.json()) as { jobs: Array<Record<string, unknown>> };
        for (const job of data.jobs ?? []) {
          if (job.conclusion !== "failure") continue;
          const steps = (job.steps as Array<Record<string, unknown>>) ?? [];
          const firstFailed = steps.find((step) => step.conclusion === "failure");
          if (!firstFailed) continue;
          row.failedStep = {
            jobId: Number(job.id),
            jobName: String(job.name ?? ""),
            stepName: String(firstFailed.name ?? ""),
          };
          return;
        }
      } catch {
        // skip
      }
    })
  );

  return { runs: top };
}

export async function buildLog(token: string, repo: string, jobId: string): Promise<Response> {
  const res = await gh(`/repos/${repo}/actions/jobs/${jobId}/logs`, token, {
    redirect: "follow",
  });
  if (res.status === 404) {
    return jsonResponse({ error: "Log not available (may have been purged)" }, { status: 404 });
  }
  if (!res.ok) {
    return jsonResponse({ error: "upstream request failed" }, { status: 502 });
  }
  const text = await res.text();
  const lines = text.split("\n");
  const tail = lines.slice(Math.max(0, lines.length - LOG_TAIL_LINES)).join("\n");
  return jsonResponse({ lines: LOG_TAIL_LINES, truncatedFrom: lines.length, log: tail });
}

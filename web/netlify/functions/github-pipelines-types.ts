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

export interface PipelineStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
}

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

export interface HistoryBlob {
  updatedAt: string;
  days: Record<string, Record<string, Record<string, HistoryDay>>>;
}

export interface HistoryDay {
  runId: number;
  conclusion: Conclusion;
  htmlUrl: string;
}

export interface PulsePayload {
  lastRun: {
    conclusion: Conclusion;
    createdAt: string;
    htmlUrl: string;
    runNumber: number;
    releaseTag: string | null;
    weeklyTag?: string | null;
  } | null;
  streak: number;
  streakKind: "success" | "failure" | "mixed";
  recent: Array<{ conclusion: Conclusion; createdAt: string; htmlUrl: string }>;
  nextCron: string;
}

export interface MatrixCell {
  date: string;
  conclusion: Conclusion;
  htmlUrl: string;
}

export interface MatrixWorkflow {
  repo: string;
  name: string;
  cells: MatrixCell[];
}

export interface MatrixPayload {
  days: number;
  range: string[];
  workflows: MatrixWorkflow[];
}

export interface FlowRun {
  run: WorkflowRun;
  jobs: Job[];
}

export interface FlowPayload {
  runs: FlowRun[];
}

export interface FailureRow {
  repo: string;
  runId: number;
  workflow: string;
  htmlUrl: string;
  branch: string;
  event: string;
  conclusion: Conclusion;
  createdAt: string;
  durationMs: number;
  failedStep: { jobId: number; jobName: string; stepName: string } | null;
  pullRequests?: PullRequestRef[];
}

export interface FailuresPayload {
  runs: FailureRow[];
}

export interface ReleaseInfo {
  releaseTag: string | null;
  weeklyTag: string | null;
}

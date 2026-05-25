import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertResponseHasNoSecrets,
  FAKE_GITHUB_TOKEN,
  readJson,
  TEST_CORS_ORIGIN,
  TEST_NETLIFY_BASE_URL,
} from "./netlify-handler-helpers";

const FAKE_CLIENT_AUTH = "client-auth-placeholder-not-a-real-secret";
const FAKE_INSTALL_TOKEN = "install-token-placeholder-not-a-real-secret";
const FAKE_UPSTREAM_SECRET = "gho_mock_upstream_secret_should_never_leak";
const REPO_OWNER = "kubestellar";
const REPO_NAME = "console";
const REPO_SLUG = `${REPO_OWNER}/${REPO_NAME}`;

const {
  mockHandlePreflight,
  mockVerifyClientAuth,
  mockGetInstallationCred,
  mockEnforceSimpleRateLimit,
  mockGetRepoPermissions,
  mockAddSubIssue,
  mockFetch,
} = vi.hoisted(() => ({
  mockHandlePreflight: vi.fn(),
  mockVerifyClientAuth: vi.fn(),
  mockGetInstallationCred: vi.fn(),
  mockEnforceSimpleRateLimit: vi.fn(),
  mockGetRepoPermissions: vi.fn(),
  mockAddSubIssue: vi.fn(),
  mockFetch: vi.fn(),
}));

vi.mock("../_shared/rate-limit", () => ({
  enforceSimpleRateLimit: mockEnforceSimpleRateLimit,
}));

vi.mock("../_shared/cors", () => ({
  handlePreflight: mockHandlePreflight,
}));

vi.mock("../_shared/feedback-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../_shared/feedback-helpers")>();
  return {
    ...actual,
    verifyClientAuth: mockVerifyClientAuth,
    getInstallationCred: mockGetInstallationCred,
    getRepoPermissions: mockGetRepoPermissions,
    addSubIssue: mockAddSubIssue,
  };
});

import handler from "../feedback-app.mts";
import { CLIENT_AUTH_HEADER, GITHUB_API } from "../_shared/feedback-helpers";

function makeRequest(options?: {
  method?: string;
  search?: string;
  includeClientAuth?: boolean;
  headers?: Record<string, string>;
  body?: string;
}): Request {
  const search = options?.search ? `?${options.search}` : "";
  const headers: Record<string, string> = {
    Origin: TEST_CORS_ORIGIN,
    ...(options?.includeClientAuth === false ? {} : { [CLIENT_AUTH_HEADER]: FAKE_CLIENT_AUTH }),
    ...options?.headers,
  };

  if (options?.body !== undefined) {
    headers["content-type"] = headers["content-type"] ?? "application/json";
    headers["content-length"] = headers["content-length"] ?? String(options.body.length);
  }

  return new Request(`${TEST_NETLIFY_BASE_URL}/api/feedback-app${search}`, {
    method: options?.method ?? "GET",
    headers,
    body: options?.body,
  });
}

function makeValidCreateBody(overrides?: Record<string, unknown>): string {
  return JSON.stringify({
    repoOwner: REPO_OWNER,
    repoName: REPO_NAME,
    title: "Feedback title",
    body: "Feedback body",
    ...overrides,
  });
}

async function readJsonAndAssertSafe<T>(response: Response): Promise<T> {
  const raw = await response.clone().text();
  assertResponseHasNoSecrets(raw, [
    FAKE_GITHUB_TOKEN,
    FAKE_CLIENT_AUTH,
    FAKE_INSTALL_TOKEN,
    FAKE_UPSTREAM_SECRET,
    "github_pat_",
    "gho_",
  ]);
  return readJson<T>(response);
}

describe("feedback-app", () => {
  let consoleErrorSpy: { mockRestore: () => void };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mockHandlePreflight.mockReturnValue(new Response(null, { status: 204 }));
    mockVerifyClientAuth.mockResolvedValue({ login: "octocat", id: 101 });
    mockGetInstallationCred.mockResolvedValue(FAKE_INSTALL_TOKEN);
    mockEnforceSimpleRateLimit.mockResolvedValue({ limited: false });
    mockGetRepoPermissions.mockResolvedValue({ push: true });
    mockAddSubIssue.mockResolvedValue(undefined);
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ id: 99, number: 12, html_url: `https://github.com/${REPO_SLUG}/issues/12` }), {
        status: 201,
        headers: { "Content-Type": "application/json", "content-length": "83" },
      }),
    );
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  describe("request guards", () => {
    it("handles OPTIONS preflight via cors helper", async () => {
      const request = makeRequest({ method: "OPTIONS", includeClientAuth: false });
      const res = await handler(request);

      expect(res.status).toBe(204);
      expect(mockHandlePreflight).toHaveBeenCalledOnce();
      expect(mockHandlePreflight).toHaveBeenCalledWith(request, expect.any(Object));
      expect(await res.text()).toBe("");
    });

    it("returns 405 for unsupported methods", async () => {
      const res = await handler(makeRequest({ method: "PUT", includeClientAuth: false }));

      expect(res.status).toBe(405);
      expect(await readJsonAndAssertSafe<{ error: string }>(res)).toEqual({ error: "Method not allowed" });
      expect(mockVerifyClientAuth).not.toHaveBeenCalled();
    });

    it("returns 401 when client auth header is missing", async () => {
      const res = await handler(makeRequest({ method: "POST", includeClientAuth: false, body: makeValidCreateBody() }));

      expect(res.status).toBe(401);
      expect(await readJsonAndAssertSafe<{ error: string }>(res)).toEqual({ error: "Missing client credential" });
      expect(mockVerifyClientAuth).not.toHaveBeenCalled();
    });

    it("returns 413 for oversized request bodies from content-length", async () => {
      const res = await handler(
        makeRequest({
          method: "POST",
          body: JSON.stringify({ ok: true }),
          headers: { "content-length": "102401" },
        }),
      );

      expect(res.status).toBe(413);
      expect(await readJsonAndAssertSafe<{ error: string }>(res)).toEqual({ error: "Request body too large" });
      expect(mockVerifyClientAuth).not.toHaveBeenCalled();
    });

    it("returns 400 for invalid JSON", async () => {
      const res = await handler(makeRequest({ method: "POST", body: "{" }));

      expect(res.status).toBe(400);
      expect(await readJsonAndAssertSafe<{ error: string }>(res)).toEqual({ error: "Invalid JSON body" });
      expect(mockVerifyClientAuth).not.toHaveBeenCalled();
    });

    it("returns 400 when request validation fails", async () => {
      const res = await handler(
        makeRequest({
          method: "POST",
          body: JSON.stringify({ repoOwner: REPO_OWNER, repoName: REPO_NAME }),
        }),
      );

      expect(res.status).toBe(400);
      const body = await readJsonAndAssertSafe<{ error: string }>(res);
      expect(body.error).toBe("title and body are required for issue creation");
      expect(mockVerifyClientAuth).not.toHaveBeenCalled();
    });

    it("returns 400 when repoOwner and repoName are missing", async () => {
      const res = await handler(makeRequest({ search: "mode=capabilities" }));

      expect(res.status).toBe(400);
      expect(await readJsonAndAssertSafe<{ error: string }>(res)).toEqual({ error: "repoOwner and repoName required" });
      expect(mockVerifyClientAuth).not.toHaveBeenCalled();
    });

    it("returns 403 when repository is not allowlisted", async () => {
      const res = await handler(makeRequest({ search: "repoOwner=evil&repoName=repo" }));

      expect(res.status).toBe(403);
      expect(await readJsonAndAssertSafe<{ error: string }>(res)).toEqual({ error: "Repository not allowed" });
      expect(mockVerifyClientAuth).not.toHaveBeenCalled();
    });

    it("returns 401 when client auth verification fails", async () => {
      mockVerifyClientAuth.mockRejectedValueOnce(new Error(`bad token ${FAKE_CLIENT_AUTH}`));
      const res = await handler(makeRequest({ search: `repoOwner=${REPO_OWNER}&repoName=${REPO_NAME}` }));

      expect(res.status).toBe(401);
      expect(await readJsonAndAssertSafe<{ error: string }>(res)).toEqual({ error: "Client authentication failed" });
    });

    it("returns 429 when the rate limit is exceeded", async () => {
      mockEnforceSimpleRateLimit.mockResolvedValueOnce({ limited: true, retryAfterSeconds: 60 });
      const res = await handler(makeRequest({ method: "POST", body: makeValidCreateBody() }));

      expect(res.status).toBe(429);
      expect(await readJsonAndAssertSafe<{ error: string; retryAfter: number }>(res)).toEqual({
        error: "Rate limit exceeded",
        retryAfter: 60,
      });
      expect(mockGetInstallationCred).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("capabilities mode", () => {
    it("returns repo capabilities for GET requests", async () => {
      const res = await handler(
        makeRequest({ search: `mode=capabilities&repoOwner=${REPO_OWNER}&repoName=${REPO_NAME}` }),
      );

      expect(res.status).toBe(200);
      expect(await readJsonAndAssertSafe<{ can_link_parent: boolean }>(res)).toEqual({ can_link_parent: true });
      expect(mockVerifyClientAuth).toHaveBeenCalledWith(FAKE_CLIENT_AUTH);
      expect(mockGetRepoPermissions).toHaveBeenCalledWith(FAKE_CLIENT_AUTH, REPO_SLUG);
      expect(mockGetInstallationCred).not.toHaveBeenCalled();
    });
  });

  describe("POST mutations", () => {
    it("returns 502 when installation credentials are unavailable", async () => {
      mockGetInstallationCred.mockRejectedValueOnce(new Error(`token missing ${FAKE_GITHUB_TOKEN}`));
      const res = await handler(makeRequest({ method: "POST", body: makeValidCreateBody() }));

      expect(res.status).toBe(502);
      expect(await readJsonAndAssertSafe<{ error: string }>(res)).toEqual({ error: "Service temporarily unavailable" });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("creates issues through the GitHub API and returns the new issue URL", async () => {
      const res = await handler(
        makeRequest({
          method: "POST",
          body: makeValidCreateBody({ labels: ["bug", "triage"] }),
        }),
      );

      expect(res.status).toBe(200);
      const body = await readJsonAndAssertSafe<{ number: number; html_url: string; submitter: string }>(res);
      expect(body).toMatchObject({
        number: 12,
        html_url: `https://github.com/${REPO_SLUG}/issues/12`,
        submitter: "octocat",
      });
      expect(mockFetch).toHaveBeenCalledWith(`${GITHUB_API}/repos/${REPO_SLUG}/issues`, {
        method: "POST",
        headers: expect.objectContaining({
          Authorization: `Bearer ${FAKE_INSTALL_TOKEN}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        }),
        body: expect.any(String),
        signal: expect.any(AbortSignal),
      });
      expect(JSON.parse(mockFetch.mock.calls[0]?.[1]?.body as string)).toEqual({
        title: "Feedback title",
        body: expect.stringContaining("Submitted by @octocat via KubeStellar Console"),
        labels: ["bug", "triage"],
      });
    });

    it("comments on an existing issue with the correct issue number", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ html_url: `https://github.com/${REPO_SLUG}/issues/44#issuecomment-1` }), {
          status: 201,
          headers: { "Content-Type": "application/json", "content-length": "82" },
        }),
      );

      const res = await handler(
        makeRequest({
          method: "POST",
          body: makeValidCreateBody({ action: "comment_issue", issueNumber: 44, body: "Looks good" }),
        }),
      );

      expect(res.status).toBe(200);
      expect(await readJsonAndAssertSafe<{ html_url: string; submitter: string }>(res)).toEqual({
        html_url: `https://github.com/${REPO_SLUG}/issues/44#issuecomment-1`,
        submitter: "octocat",
      });
      expect(mockFetch).toHaveBeenCalledWith(`${GITHUB_API}/repos/${REPO_SLUG}/issues/44/comments`, {
        method: "POST",
        headers: expect.objectContaining({ Authorization: `Bearer ${FAKE_INSTALL_TOKEN}` }),
        body: expect.any(String),
        signal: expect.any(AbortSignal),
      });
      expect(JSON.parse(mockFetch.mock.calls[0]?.[1]?.body as string)).toEqual({
        body: expect.stringContaining("Looks good"),
      });
    });

    it("updates issue state with the requested state value", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ html_url: `https://github.com/${REPO_SLUG}/issues/44`, state: "closed" }), {
          status: 200,
          headers: { "Content-Type": "application/json", "content-length": "72" },
        }),
      );

      const res = await handler(
        makeRequest({
          method: "POST",
          body: makeValidCreateBody({ action: "update_issue_state", issueNumber: 44, state: "closed" }),
        }),
      );

      expect(res.status).toBe(200);
      expect(await readJsonAndAssertSafe<{ html_url: string; state: string; submitter: string }>(res)).toEqual({
        html_url: `https://github.com/${REPO_SLUG}/issues/44`,
        state: "closed",
        submitter: "octocat",
      });
      expect(mockFetch).toHaveBeenCalledWith(`${GITHUB_API}/repos/${REPO_SLUG}/issues/44`, {
        method: "PATCH",
        headers: expect.objectContaining({ Authorization: `Bearer ${FAKE_INSTALL_TOKEN}` }),
        body: JSON.stringify({ state: "closed" }),
        signal: expect.any(AbortSignal),
      });
    });

    it("sanitizes GitHub 4xx failures without leaking credentials", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ message: `invalid ${FAKE_UPSTREAM_SECRET}`, token: FAKE_INSTALL_TOKEN }), {
          status: 422,
          headers: { "Content-Type": "application/json", "content-length": "140" },
        }),
      );

      const res = await handler(makeRequest({ method: "POST", body: makeValidCreateBody() }));

      expect(res.status).toBe(422);
      expect(await readJsonAndAssertSafe<{ error: string }>(res)).toEqual({ error: "Failed to create issue" });
    });

    it("returns a safe error for GitHub 5xx failures without raw upstream content", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(`GitHub exploded: ${FAKE_UPSTREAM_SECRET}`, {
          status: 500,
          headers: { "Content-Type": "text/plain", "content-length": "57" },
        }),
      );

      const res = await handler(makeRequest({ method: "POST", body: makeValidCreateBody() }));

      expect(res.status).toBe(500);
      expect(await readJsonAndAssertSafe<{ error: string }>(res)).toEqual({ error: "Failed to create issue" });
    });
  });
});

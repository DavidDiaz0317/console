const GITHUB_BASE_URL = 'https://github.com'

type GitHubLabels = readonly string[] | string

export interface BuildGitHubIssueUrlOptions {
  owner: string
  repo: string
  title?: string
  body?: string
  labels?: GitHubLabels
}

export interface BuildGitHubNewFileUrlOptions {
  owner: string
  repo: string
  branch: string
  path: string
  filename: string
  content: string
  message: string
  description?: string
}

function normalizeLabels(labels?: GitHubLabels): string {
  if (!labels) return ''
  return Array.isArray(labels) ? labels.join(',') : labels
}

export function buildGitHubIssueUrl({
  owner,
  repo,
  title,
  body,
  labels,
}: BuildGitHubIssueUrlOptions): string {
  const params = new URLSearchParams()

  if (title) params.set('title', title)
  if (body) params.set('body', body)

  const normalizedLabels = normalizeLabels(labels)
  if (normalizedLabels) params.set('labels', normalizedLabels)

  const query = params.toString()
  return `${GITHUB_BASE_URL}/${owner}/${repo}/issues/new${query ? `?${query}` : ''}`
}

export function buildGitHubNewFileUrl({
  owner,
  repo,
  branch,
  path,
  filename,
  content,
  message,
  description,
}: BuildGitHubNewFileUrlOptions): string {
  const params = new URLSearchParams({
    filename,
    value: content,
    message,
  })

  if (description) params.set('description', description)

  return `${GITHUB_BASE_URL}/${owner}/${repo}/new/${branch}/${path}?${params.toString()}`
}

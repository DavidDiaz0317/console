import { describe, expect, it } from 'vitest'
import { buildGitHubIssueUrl, buildGitHubNewFileUrl } from './githubUrls'

describe('buildGitHubIssueUrl', () => {
  it('omits the query string when no fields are provided', () => {
    expect(buildGitHubIssueUrl({ owner: 'kubestellar', repo: 'console' })).toBe(
      'https://github.com/kubestellar/console/issues/new',
    )
  })

  it('builds the same issue URL shape used by existing consumers', () => {
    expect(
      buildGitHubIssueUrl({
        owner: 'kubestellar',
        repo: 'console-kb',
        title: 'Improve AI Mission: Kyverno (install)',
        body: '## Mission Improvement Request\n\nDetails here',
        labels: ['ai-mission', 'community-improvement', 'install'],
      }),
    ).toBe(
      'https://github.com/kubestellar/console-kb/issues/new?title=Improve+AI+Mission%3A+Kyverno+%28install%29&body=%23%23+Mission+Improvement+Request%0A%0ADetails+here&labels=ai-mission%2Ccommunity-improvement%2Cinstall',
    )
  })
})

describe('buildGitHubNewFileUrl', () => {
  it('builds the same new-file URL shape used by existing consumers', () => {
    expect(
      buildGitHubNewFileUrl({
        owner: 'kubestellar',
        repo: 'console-kb',
        branch: 'master',
        path: 'fixes/cncf-install',
        filename: 'install-kyverno.json',
        content: '{"title":"Kyverno"}',
        message: 'Add install-kyverno.json: Kyverno install guide',
        description: 'Submitted from KubeStellar Console resolution history.\n\nKyverno install guide',
      }),
    ).toBe(
      'https://github.com/kubestellar/console-kb/new/master/fixes/cncf-install?filename=install-kyverno.json&value=%7B%22title%22%3A%22Kyverno%22%7D&message=Add+install-kyverno.json%3A+Kyverno+install+guide&description=Submitted+from+KubeStellar+Console+resolution+history.%0A%0AKyverno+install+guide',
    )
  })
})

import type { Route } from '@playwright/test'

export function isDocumentRoute(route: Route): boolean {
  return route.request().resourceType() === 'document'
}

export function routePath(route: Route): string {
  try {
    return new URL(route.request().url()).pathname
  } catch {
    return '/'
  }
}

export function appShellHtml(body: string, title = 'KubeStellar Console Mutation'): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; background: #0f172a; color: #e2e8f0; }
    main { padding: 32px; min-height: 100vh; box-sizing: border-box; }
    nav { display: flex; gap: 16px; padding: 16px 24px; background: #111827; }
    button, a { font: inherit; }
    .card { border: 1px solid #334155; border-radius: 8px; background: #182235; padding: 18px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
  </style>
</head>
<body>${body}</body>
</html>`
}

export function loginHtml(extraStyle = ''): string {
  return appShellHtml(`
    <main data-testid="login-page" style="${extraStyle}">
      <h1 data-testid="login-welcome-heading">KubeStellar Console</h1>
      <p>Sign in to continue to your clusters.</p>
      <button data-testid="github-login-button" style="padding: 12px 18px;">Continue with GitHub</button>
    </main>
  `, 'KubeStellar Login Mutation')
}

export function dashboardHtml(extra = ''): string {
  return appShellHtml(`
    <nav aria-label="Primary">
      <a href="/">Dashboard</a>
      <a href="/clusters">Clusters</a>
      <a href="/workloads">Workloads</a>
      <button data-tour="ai-missions-toggle">AI Missions</button>
    </nav>
    <main id="main-content">
      <section data-testid="dashboard-header">
        <h1 data-testid="dashboard-title">KubeStellar Dashboard</h1>
        <p>Demo cluster fleet health and workload overview.</p>
      </section>
      <section class="grid" data-testid="dashboard-card-grid">
        <article class="card"><h2>Clusters</h2><p>3 connected clusters</p></article>
        <article class="card"><h2>Workloads</h2><p>42 running workloads</p></article>
      </section>
      ${extra}
    </main>
  `)
}

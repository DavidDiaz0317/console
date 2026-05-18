import type { PayloadProject } from '../types'

export function stripMarkdownCodeBlocks(content: string): string {
  return content
    .replace(/```json[\s\S]*?```/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .trim()
}

export function summarizeProjects(projects: PayloadProject[]) {
  const counts: Record<string, number> = {}

  for (const project of projects) {
    counts[project.category] = (counts[project.category] || 0) + 1
  }

  return {
    categoryCounts: Object.entries(counts).sort((a, b) => b[1] - a[1]),
    priorityCounts: {
      required: projects.filter((project) => project.priority === 'required').length,
      recommended: projects.filter((project) => project.priority === 'recommended').length,
      optional: projects.filter((project) => project.priority === 'optional').length,
    },
    totalDeps: new Set(projects.flatMap((project) => project.dependencies)).size,
  }
}

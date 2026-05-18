import { Box, Eye, Layers, Lock, Network, Shield, type LucideIcon } from 'lucide-react'
import type { PayloadProject } from '../types'
import { summarizeProjects } from './fixerDefinitionPanel.utils'

interface MissionSummarySidebarProps {
  projects: PayloadProject[]
}

const DEFAULT_CATEGORY_ICON = Layers

const CATEGORY_ICON_CONFIG: Record<string, { icon: LucideIcon; className: string }> = {
  Security: { icon: Shield, className: 'text-red-400' },
  'Runtime Security': { icon: Shield, className: 'text-red-400' },
  'Vulnerability Scanning': { icon: Eye, className: 'text-orange-400' },
  'Policy Enforcement': { icon: Lock, className: 'text-amber-400' },
  Networking: { icon: Network, className: 'text-sky-400' },
  'Network Security': { icon: Network, className: 'text-sky-400' },
  'Service Mesh': { icon: Network, className: 'text-cyan-400' },
  Observability: { icon: Eye, className: 'text-blue-400' },
  'Identity & Encryption': { icon: Lock, className: 'text-purple-400' },
  'Authentication & IAM': { icon: Lock, className: 'text-purple-400' },
  'Secrets Management': { icon: Lock, className: 'text-emerald-400' },
  Storage: { icon: Box, className: 'text-green-400' },
  Custom: { icon: Layers, className: 'text-slate-400' },
}

function CategoryIcon({ category }: { category: string }) {
  const config = CATEGORY_ICON_CONFIG[category]
  const Icon = config?.icon ?? DEFAULT_CATEGORY_ICON

  return <Icon className={`w-3 h-3 ${config?.className ?? 'text-slate-400'}`} />
}

export function MissionSummarySidebar({ projects }: MissionSummarySidebarProps) {
  const { categoryCounts, priorityCounts, totalDeps } = summarizeProjects(projects)

  return (
    <div className="w-56 border-r border-border bg-card p-4 flex flex-col gap-4 overflow-y-auto shrink-0">
      <div>
        <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Mission Summary</h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Projects</span>
            <span className="font-semibold text-foreground">{projects.length}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Dependencies</span>
            <span className="font-semibold text-foreground">{totalDeps}</span>
          </div>
        </div>
      </div>

      {projects.length > 0 ? (
        <>
          <div>
            <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">By Priority</h3>
            <div className="space-y-1.5">
              {priorityCounts.required > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-2 h-2 rounded-full bg-red-400" />
                  <span className="text-muted-foreground flex-1">Required</span>
                  <span className="font-semibold text-foreground">{priorityCounts.required}</span>
                </div>
              )}
              {priorityCounts.recommended > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-2 h-2 rounded-full bg-blue-400" />
                  <span className="text-muted-foreground flex-1">Recommended</span>
                  <span className="font-semibold text-foreground">{priorityCounts.recommended}</span>
                </div>
              )}
              {priorityCounts.optional > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-2 h-2 rounded-full bg-gray-400" />
                  <span className="text-muted-foreground flex-1">Optional</span>
                  <span className="font-semibold text-foreground">{priorityCounts.optional}</span>
                </div>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">By Category</h3>
            <div className="space-y-1.5">
              {categoryCounts.map(([category, count]) => (
                <div key={category} className="flex items-center gap-2 text-xs">
                  <CategoryIcon category={category} />
                  <span className="text-muted-foreground flex-1 truncate" title={category}>{category}</span>
                  <span className="font-semibold text-foreground">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground/50">
          <Layers className="w-6 h-6 mb-2" />
          <p className="text-[10px] text-center">Describe your fix to get started</p>
        </div>
      )}
    </div>
  )
}

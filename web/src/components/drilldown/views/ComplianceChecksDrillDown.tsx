/**
 * Compliance Checks drill-down view.
 *
 * Shows per-control/policy check results from Kubescape and Kyverno,
 * scoped to the active global filters (cluster(s)). Opened when clicking
 * the Checks stat blocks (total_checks / passing / failing) on the
 * Compliance dashboard.
 */

import { useState, useMemo } from 'react'
import {
  Shield, CheckCircle, XCircle, AlertTriangle, Search,
  ChevronLeft, ChevronRight,
} from 'lucide-react'
import { useKubescape } from '../../../hooks/useKubescape'
import { useKyverno } from '../../../hooks/useKyverno'
import { useGlobalFilters } from '../../../hooks/useGlobalFilters'

interface Props {
  data: Record<string, unknown>
}

/** Unified check row across tools */
interface CheckRow {
  id: string
  name: string
  tool: 'Kubescape' | 'Kyverno'
  cluster: string
  passed: number
  failed: number
  status: 'pass' | 'fail' | 'mixed'
}

/** Checks shown per page */
const PAGE_SIZE = 25

function statusIcon(status: CheckRow['status']) {
  switch (status) {
    case 'pass': return <CheckCircle className="w-4 h-4 text-green-400" />
    case 'fail': return <XCircle className="w-4 h-4 text-red-400" />
    default: return <AlertTriangle className="w-4 h-4 text-yellow-400" />
  }
}

function statusLabel(status: CheckRow['status']) {
  switch (status) {
    case 'pass': return 'Pass'
    case 'fail': return 'Fail'
    default: return 'Mixed'
  }
}

function statusBadgeClass(status: CheckRow['status']) {
  switch (status) {
    case 'pass': return 'text-green-400 bg-green-500/15 border border-green-500/30'
    case 'fail': return 'text-red-400 bg-red-500/15 border border-red-500/30'
    default: return 'text-yellow-400 bg-yellow-500/15 border border-yellow-500/30'
  }
}

export function ComplianceChecksDrillDown({ data }: Props) {
  const filterStatus = (data.filter as string) || ''
  const { statuses: kubescapeStatuses } = useKubescape()
  const { statuses: kyvernoStatuses } = useKyverno()
  const { selectedClusters } = useGlobalFilters()

  // Normalize filter values: 'passing' → 'pass', 'failing' → 'fail'
  const normalizeFilter = (f: string): string => {
    if (f === 'passing') return 'pass'
    if (f === 'failing') return 'fail'
    return f
  }

  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>(normalizeFilter(filterStatus))
  const [clusterFilter, setClusterFilter] = useState<string>('all')
  const [toolFilter, setToolFilter] = useState<string>('all')
  const [page, setPage] = useState(0)

  // Build rows from Kubescape controls
  const kubescapeRows = useMemo<CheckRow[]>(() => {
    const rows: CheckRow[] = []
    for (const [clusterName, status] of Object.entries(kubescapeStatuses)) {
      if (!status.installed) continue
      if (selectedClusters.length > 0 && !selectedClusters.includes(clusterName)) continue
      for (const ctrl of (status.controls || [])) {
        const checkStatus: CheckRow['status'] =
          ctrl.failed === 0 ? 'pass' : ctrl.passed === 0 ? 'fail' : 'mixed'
        rows.push({
          id: ctrl.id,
          name: ctrl.name,
          tool: 'Kubescape',
          cluster: clusterName,
          passed: ctrl.passed,
          failed: ctrl.failed,
          status: checkStatus,
        })
      }
    }
    return rows
  }, [kubescapeStatuses, selectedClusters])

  // Build rows from Kyverno policies
  const kyvernoRows = useMemo<CheckRow[]>(() => {
    const rows: CheckRow[] = []
    for (const [clusterName, status] of Object.entries(kyvernoStatuses)) {
      if (!status.installed) continue
      if (selectedClusters.length > 0 && !selectedClusters.includes(clusterName)) continue
      for (const policy of (status.policies || [])) {
        const violations = policy.violations ?? 0
        const checkStatus: CheckRow['status'] = violations === 0 ? 'pass' : 'fail'
        rows.push({
          id: `${clusterName}/${policy.name}`,
          name: policy.name,
          tool: 'Kyverno',
          cluster: clusterName,
          passed: violations === 0 ? 1 : 0,
          failed: violations > 0 ? violations : 0,
          status: checkStatus,
        })
      }
    }
    return rows
  }, [kyvernoStatuses, selectedClusters])

  const allRows = useMemo(() => [...kubescapeRows, ...kyvernoRows], [kubescapeRows, kyvernoRows])

  // Apply filters
  const filteredRows = useMemo(() => {
    let result = allRows

    if (statusFilter && statusFilter !== 'all') {
      result = result.filter(r => r.status === statusFilter)
    }
    if (clusterFilter !== 'all') {
      result = result.filter(r => r.cluster === clusterFilter)
    }
    if (toolFilter !== 'all') {
      result = result.filter(r => r.tool === toolFilter)
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(r =>
        r.name.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        r.cluster.toLowerCase().includes(q)
      )
    }

    return result
  }, [allRows, statusFilter, clusterFilter, toolFilter, searchQuery])

  // Reset to first page when filters change
  const pagedRows = useMemo(() => {
    return filteredRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  }, [filteredRows, page])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))

  const uniqueClusters = useMemo(() => {
    return ['all', ...Array.from(new Set(allRows.map(r => r.cluster)))]
  }, [allRows])

  const uniqueTools = useMemo(() => {
    return ['all', ...Array.from(new Set(allRows.map(r => r.tool)))]
  }, [allRows])

  // Summary stats
  const totalChecks = filteredRows.length
  const passingChecks = filteredRows.filter(r => r.status === 'pass').length
  const failingChecks = filteredRows.filter(r => r.status === 'fail').length

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value)
    setPage(0)
  }

  const handleStatusFilter = (v: string) => {
    setStatusFilter(v)
    setPage(0)
  }

  const handleClusterFilter = (v: string) => {
    setClusterFilter(v)
    setPage(0)
  }

  const handleToolFilter = (v: string) => {
    setToolFilter(v)
    setPage(0)
  }

  if (allRows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Shield className="w-12 h-12 mb-3 opacity-40" />
        <p className="text-sm font-medium">No checks data available</p>
        <p className="text-xs mt-1">Install Kubescape or Kyverno to see compliance checks.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-foreground">{totalChecks}</div>
          <div className="text-xs text-muted-foreground mt-1">Total Checks</div>
        </div>
        <div className="glass rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-green-400">{passingChecks}</div>
          <div className="text-xs text-muted-foreground mt-1">Passing</div>
        </div>
        <div className="glass rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-red-400">{failingChecks}</div>
          <div className="text-xs text-muted-foreground mt-1">Failing</div>
        </div>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search checks…"
            value={searchQuery}
            onChange={handleSearchChange}
            className="w-full pl-7 pr-3 py-1.5 text-xs rounded-lg bg-secondary/50 border border-border focus:outline-none focus:border-primary/50 text-foreground"
          />
        </div>

        {/* Status filter */}
        <select
          value={statusFilter || 'all'}
          onChange={e => handleStatusFilter(e.target.value)}
          className="text-xs rounded-lg bg-secondary/50 border border-border px-2 py-1.5 focus:outline-none text-foreground"
        >
          <option value="all">All statuses</option>
          <option value="pass">Passing</option>
          <option value="fail">Failing</option>
          <option value="mixed">Mixed</option>
        </select>

        {/* Tool filter */}
        {uniqueTools.length > 2 && (
          <select
            value={toolFilter}
            onChange={e => handleToolFilter(e.target.value)}
            className="text-xs rounded-lg bg-secondary/50 border border-border px-2 py-1.5 focus:outline-none text-foreground"
          >
            {uniqueTools.map(t => (
              <option key={t} value={t}>{t === 'all' ? 'All tools' : t}</option>
            ))}
          </select>
        )}

        {/* Cluster filter */}
        {uniqueClusters.length > 2 && (
          <select
            value={clusterFilter}
            onChange={e => handleClusterFilter(e.target.value)}
            className="text-xs rounded-lg bg-secondary/50 border border-border px-2 py-1.5 focus:outline-none text-foreground"
          >
            {uniqueClusters.map(c => (
              <option key={c} value={c}>{c === 'all' ? 'All clusters' : c}</option>
            ))}
          </select>
        )}
      </div>

      {/* Results count */}
      <div className="text-xs text-muted-foreground">
        {filteredRows.length === 0
          ? 'No checks match the current filters.'
          : `Showing ${pagedRows.length} of ${filteredRows.length} checks`}
      </div>

      {/* Checks table */}
      {filteredRows.length > 0 && (
        <>
          <div className="space-y-1">
            {/* Header */}
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-3 py-1.5 text-xs font-medium text-muted-foreground border-b border-border">
              <span>Check / Control</span>
              <span className="text-right w-14">Status</span>
              <span className="text-right w-14">Passed</span>
              <span className="text-right w-14">Failed</span>
              <span className="text-right w-20">Tool</span>
            </div>

            {pagedRows.map((row, i) => (
              <div
                key={`${row.tool}-${row.cluster}-${row.id}-${i}`}
                className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-3 py-2 text-xs rounded-lg hover:bg-secondary/30 transition-colors items-center"
              >
                {/* Name + cluster */}
                <div className="min-w-0">
                  <div className="font-medium text-foreground truncate">{row.name}</div>
                  <div className="text-muted-foreground truncate">{row.cluster}</div>
                </div>

                {/* Status badge */}
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 w-14 justify-center ${statusBadgeClass(row.status)}`}>
                  {statusIcon(row.status)}
                  {statusLabel(row.status)}
                </span>

                {/* Passed count */}
                <span className="text-right w-14 font-mono text-green-400">{row.passed}</span>

                {/* Failed count */}
                <span className={`text-right w-14 font-mono ${row.failed > 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                  {row.failed}
                </span>

                {/* Tool badge */}
                <span className={`text-right w-20 text-[10px] font-medium ${row.tool === 'Kubescape' ? 'text-blue-400' : 'text-purple-400'}`}>
                  {row.tool}
                </span>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1 rounded hover:bg-secondary/50 disabled:opacity-30 disabled:cursor-not-allowed text-muted-foreground"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-muted-foreground">
                Page {page + 1} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-1 rounded hover:bg-secondary/50 disabled:opacity-30 disabled:cursor-not-allowed text-muted-foreground"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

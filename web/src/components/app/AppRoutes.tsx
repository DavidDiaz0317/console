import { Suspense, useState, useEffect } from 'react'
import { Route, Navigate } from 'react-router-dom'
import { BrandingProvider } from '@/hooks/useBranding'
import { ThemeProvider } from '@/hooks/useTheme'
import { AppErrorBoundary } from '@/components/AppErrorBoundary'
import { ChunkErrorBoundary } from '@/components/ChunkErrorBoundary'
import { PageErrorBoundary } from '@/components/PageErrorBoundary'
import { Layout } from '@/components/layout/Layout'
import { ROUTES } from '@/config/routes'
import { PageViewTracker } from './PageViewTracker'
import { SuspenseRoute } from './SuspenseRoute'
import { ProtectedRoute } from './ProtectedRoute'
import { IssueRedirect, FeatureRedirect } from './FeedbackRedirects'
import { CardHistoryWithRestore } from './CardHistoryWithRestore'
import * as Pages from './routeImports'

// Timing constant (milliseconds)
const LOADING_FLASH_DELAY_MS = 200

// Loading fallback component with delay to prevent flash on fast navigation
function LoadingFallback() {
  const [showLoading, setShowLoading] = useState(false)

  useEffect(() => {
    // Only show loading spinner if it takes more than LOADING_FLASH_DELAY_MS
    const timer = setTimeout(() => {
      setShowLoading(true)
    }, LOADING_FLASH_DELAY_MS)

    return () => clearTimeout(timer)
  }, [])

  if (!showLoading) {
    // Invisible placeholder maintains layout dimensions during route transitions,
    // preventing the content area from collapsing to 0 height (blank flash).
    return <div className="min-h-screen" />
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      {/* Full border with transparent sides enables GPU acceleration during rotation */}
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-transparent border-t-primary" />
    </div>
  )
}

// ⚠️ PERFORMANCE CRITICAL — DO NOT MOVE MISSION ROUTES INTO FullDashboardApp ⚠️
//
// Mission landing pages (/missions/:missionId) MUST stay in LightweightShell,
// NOT inside the FullDashboardApp provider stack. The full stack loads 12
// providers + 156 JS chunks (1.8MB) which caused 10-20s cold-cache load times.
// LightweightShell loads only ~200KB. If you move mission routes back into
// FullDashboardApp, the CNCF outreach links will be unusably slow.
//
/** Lightweight shell for standalone pages that don't need the full dashboard provider stack.
 *  Includes PageViewTracker so GA4 page_view events fire for landing pages too. */
export function LightweightShell({ children }: { children: React.ReactNode }) {
  return (
    <BrandingProvider>
    <ThemeProvider>
    <AppErrorBoundary>
    <ChunkErrorBoundary>
    <PageErrorBoundary>
    <PageViewTracker />
    <Suspense fallback={<LoadingFallback />}>
      {children}
    </Suspense>
    </PageErrorBoundary>
    </ChunkErrorBoundary>
    </AppErrorBoundary>
    </ThemeProvider>
    </BrandingProvider>
  )
}

/** Route definitions for lightweight routes (missions, public pages) */
export function LightweightRoutes() {
  return (
    <>
      {/* ── Lightweight routes ─────────────────────────────────────────
          Mission landing pages load WITHOUT the heavy dashboard provider
          stack (no DashboardProvider, AlertsProvider, MissionProvider,
          CardEventProvider, etc.). This cuts initial JS from ~1.8MB to
          ~200KB and eliminates cold-start API calls. */}
      <Route path={ROUTES.MISSION} element={
        <LightweightShell><Pages.MissionLandingPage /></LightweightShell>
      } />

      {/* ── Public landing pages ──────────────────────────────────────
          Marketing/comparison pages that must render without auth.
          On Netlify (no Go backend), AuthProvider blocks forever
          waiting for /api/me — these pages skip that entirely. */}
      <Route path={ROUTES.FROM_LENS} element={<LightweightShell><Pages.FromLens /></LightweightShell>} />
      <Route path={ROUTES.FROM_HEADLAMP} element={<LightweightShell><Pages.FromHeadlamp /></LightweightShell>} />
      <Route path={ROUTES.FROM_HOLMESGPT} element={<LightweightShell><Pages.FromHolmesGPT /></LightweightShell>} />
      <Route path={ROUTES.FEATURE_INSPEKTORGADGET} element={<LightweightShell><Pages.FeatureInspektorGadget /></LightweightShell>} />
      <Route path={ROUTES.FEATURE_KAGENT} element={<LightweightShell><Pages.FeatureKagent /></LightweightShell>} />
      <Route path={ROUTES.WHITE_LABEL} element={<LightweightShell><Pages.WhiteLabel /></LightweightShell>} />
      <Route path={ROUTES.WELCOME} element={<LightweightShell><Pages.Welcome /></LightweightShell>} />

      {/* ── Embeddable card (iframe mode) ────────────────────────────
          Renders a single CI/CD card full-screen without sidebar or nav.
          Lightweight shell keeps the bundle small for embed consumers. */}
      <Route path={ROUTES.EMBED_CARD} element={<LightweightShell><Pages.EmbedCard /></LightweightShell>} />
    </>
  )
}

/** Route definitions for full dashboard routes (protected, with all providers) */
export function DashboardRoutes() {
  return (
    <>
      <Route path={ROUTES.LOGIN} element={<PageErrorBoundary><Pages.Login /></PageErrorBoundary>} />
      <Route path={ROUTES.AUTH_CALLBACK} element={<PageErrorBoundary><Pages.AuthCallback /></PageErrorBoundary>} />
      {/* PWA Mini Dashboard - lightweight widget mode (no auth required for local monitoring) */}
      <Route path={ROUTES.WIDGET} element={<SuspenseRoute><Pages.MiniDashboard /></SuspenseRoute>} />

      {/* ── Enterprise Compliance Portal ─────────────────────────────
          Dedicated sub-portal with its own sidebar, organized by
          compliance vertical (epic). */}
      <Route path="/enterprise" element={<ProtectedRoute><SuspenseRoute><Pages.EnterpriseLayout /></SuspenseRoute></ProtectedRoute>}>
        <Route index element={<SuspenseRoute><Pages.EnterprisePortal /></SuspenseRoute>} />
        {/* Epic 1: FinTech & Regulatory */}
        <Route path="frameworks" element={<SuspenseRoute><Pages.ComplianceFrameworks /></SuspenseRoute>} />
        <Route path="change-control" element={<SuspenseRoute><Pages.ChangeControlAudit /></SuspenseRoute>} />
        <Route path="sod" element={<SuspenseRoute><Pages.SegregationOfDuties /></SuspenseRoute>} />
        <Route path="data-residency" element={<SuspenseRoute><Pages.DataResidency /></SuspenseRoute>} />
        <Route path="reports" element={<SuspenseRoute><Pages.ComplianceReports /></SuspenseRoute>} />
        {/* Epic 2: Healthcare & Life Sciences */}
        <Route path="hipaa" element={<SuspenseRoute><Pages.HIPAADashboard /></SuspenseRoute>} />
        <Route path="gxp" element={<SuspenseRoute><Pages.GxPDashboard /></SuspenseRoute>} />
        <Route path="baa" element={<SuspenseRoute><Pages.BAADashboard /></SuspenseRoute>} />
        {/* Epic 3: Government & Defense */}
        <Route path="nist" element={<SuspenseRoute><Pages.NISTDashboard /></SuspenseRoute>} />
        <Route path="stig" element={<SuspenseRoute><Pages.STIGDashboard /></SuspenseRoute>} />
        <Route path="air-gap" element={<SuspenseRoute><Pages.AirGapDashboard /></SuspenseRoute>} />
        <Route path="fedramp" element={<SuspenseRoute><Pages.FedRAMPDashboard /></SuspenseRoute>} />
        {/* Epic 4: Identity & Access */}
        <Route path="oidc" element={<SuspenseRoute><Pages.OIDCDashboard /></SuspenseRoute>} />
        <Route path="rbac-audit" element={<SuspenseRoute><Pages.RBACAuditDashboard /></SuspenseRoute>} />
        <Route path="sessions" element={<SuspenseRoute><Pages.SessionDashboard /></SuspenseRoute>} />
        {/* Epic 5: SecOps */}
        <Route path="siem" element={<SuspenseRoute><Pages.SIEMDashboard /></SuspenseRoute>} />
        <Route path="incident-response" element={<SuspenseRoute><Pages.IncidentResponseDashboard /></SuspenseRoute>} />
        <Route path="threat-intel" element={<SuspenseRoute><Pages.ThreatIntelDashboard /></SuspenseRoute>} />
        {/* Epic 6: Supply Chain Security */}
        <Route path="sbom" element={<SuspenseRoute><Pages.SBOMDashboard /></SuspenseRoute>} />
        <Route path="sigstore" element={<SuspenseRoute><Pages.SigningStatusDashboard /></SuspenseRoute>} />
        <Route path="slsa" element={<SuspenseRoute><Pages.SLSADashboard /></SuspenseRoute>} />
        <Route path="licenses" element={<SuspenseRoute><Pages.LicenseComplianceDashboard /></SuspenseRoute>} />
        {/* Epic 7: Enterprise Risk Management */}
        <Route path="risk-matrix" element={<SuspenseRoute><Pages.RiskMatrixDashboard /></SuspenseRoute>} />
        <Route path="risk-register" element={<SuspenseRoute><Pages.RiskRegisterDashboard /></SuspenseRoute>} />
        <Route path="risk-appetite" element={<SuspenseRoute><Pages.RiskAppetiteDashboard /></SuspenseRoute>} />
        <Route path="*" element={<SuspenseRoute><Pages.ComingSoon /></SuspenseRoute>} />
      </Route>

      {/* Layout route — all dashboard routes share a single Layout instance.
          KeepAliveOutlet preserves component state across navigations so that
          warm-nav is near-instant (no unmount/remount). */}
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Pages.Dashboard />} />
        <Route path={ROUTES.DASHBOARD_ALIAS} element={<Navigate to={ROUTES.HOME} replace />} />
        <Route path={ROUTES.MISSIONS} element={<Pages.Dashboard />} />
        <Route path={ROUTES.CUSTOM_DASHBOARD} element={<Pages.CustomDashboard />} />
        {/* Test routes — rendered with Layout but not cached by KeepAlive */}
        <Route path={ROUTES.PERF_ALL_CARDS} element={<Pages.AllCardsPerfTest />} />
        <Route path={ROUTES.PERF_COMPLIANCE} element={<Pages.CompliancePerfTest />} />
        <Route path={ROUTES.CLUSTERS} element={<SuspenseRoute><Pages.Clusters /></SuspenseRoute>} />
        <Route path={ROUTES.WORKLOADS} element={<SuspenseRoute><Pages.Workloads /></SuspenseRoute>} />
        <Route path={ROUTES.NODES} element={<SuspenseRoute><Pages.Nodes /></SuspenseRoute>} />
        <Route path={ROUTES.DEPLOYMENTS} element={<SuspenseRoute><Pages.Deployments /></SuspenseRoute>} />
        <Route path={ROUTES.PODS} element={<SuspenseRoute><Pages.Pods /></SuspenseRoute>} />
        <Route path={ROUTES.SERVICES} element={<SuspenseRoute><Pages.Services /></SuspenseRoute>} />
        <Route path={ROUTES.OPERATORS} element={<SuspenseRoute><Pages.Operators /></SuspenseRoute>} />
        <Route path={ROUTES.HELM} element={<SuspenseRoute><Pages.HelmReleases /></SuspenseRoute>} />
        <Route path={ROUTES.LOGS} element={<SuspenseRoute><Pages.Logs /></SuspenseRoute>} />
        <Route path={ROUTES.COMPUTE} element={<SuspenseRoute><Pages.Compute /></SuspenseRoute>} />
        <Route path={ROUTES.COMPUTE_COMPARE} element={<SuspenseRoute><Pages.ClusterComparisonPage /></SuspenseRoute>} />
        <Route path={ROUTES.STORAGE} element={<SuspenseRoute><Pages.Storage /></SuspenseRoute>} />
        <Route path={ROUTES.NETWORK} element={<SuspenseRoute><Pages.Network /></SuspenseRoute>} />
        <Route path={ROUTES.EVENTS} element={<SuspenseRoute><Pages.Events /></SuspenseRoute>} />
        <Route path={ROUTES.SECURITY} element={<SuspenseRoute><Pages.Security /></SuspenseRoute>} />
        <Route path={ROUTES.GITOPS} element={<SuspenseRoute><Pages.GitOps /></SuspenseRoute>} />
        <Route path={ROUTES.ALERTS} element={<SuspenseRoute><Pages.Alerts /></SuspenseRoute>} />
        <Route path={ROUTES.COST} element={<SuspenseRoute><Pages.Cost /></SuspenseRoute>} />
        <Route path={ROUTES.SECURITY_POSTURE} element={<SuspenseRoute><Pages.Compliance /></SuspenseRoute>} />
        {/* Legacy route for backwards compatibility */}
        <Route path={ROUTES.COMPLIANCE} element={<SuspenseRoute><Pages.Compliance /></SuspenseRoute>} />
        <Route path={ROUTES.COMPLIANCE_FRAMEWORKS} element={<SuspenseRoute><Pages.ComplianceFrameworks /></SuspenseRoute>} />
        <Route path={ROUTES.CHANGE_CONTROL} element={<SuspenseRoute><Pages.ChangeControlAudit /></SuspenseRoute>} />
        <Route path={ROUTES.SEGREGATION_OF_DUTIES} element={<SuspenseRoute><Pages.SegregationOfDuties /></SuspenseRoute>} />
        <Route path={ROUTES.COMPLIANCE_REPORTS} element={<SuspenseRoute><Pages.ComplianceReports /></SuspenseRoute>} />
        <Route path={ROUTES.DATA_RESIDENCY} element={<SuspenseRoute><Pages.DataResidency /></SuspenseRoute>} />
        <Route path={ROUTES.BAA} element={<SuspenseRoute><Pages.BAADashboard /></SuspenseRoute>} />
        <Route path={ROUTES.HIPAA} element={<SuspenseRoute><Pages.HIPAADashboard /></SuspenseRoute>} />
        <Route path={ROUTES.GXP} element={<SuspenseRoute><Pages.GxPDashboard /></SuspenseRoute>} />
        <Route path={ROUTES.NIST} element={<SuspenseRoute><Pages.NISTDashboard /></SuspenseRoute>} />
        <Route path={ROUTES.STIG} element={<SuspenseRoute><Pages.STIGDashboard /></SuspenseRoute>} />
        <Route path={ROUTES.AIR_GAP} element={<SuspenseRoute><Pages.AirGapDashboard /></SuspenseRoute>} />
        <Route path={ROUTES.FEDRAMP} element={<SuspenseRoute><Pages.FedRAMPDashboard /></SuspenseRoute>} />
        <Route path={ROUTES.DATA_COMPLIANCE} element={<SuspenseRoute><Pages.DataCompliance /></SuspenseRoute>} />
        <Route path={ROUTES.GPU_RESERVATIONS} element={<SuspenseRoute><Pages.GPUReservations /></SuspenseRoute>} />
        <Route path={ROUTES.KARMADA_OPS} element={<SuspenseRoute><Pages.KarmadaOps /></SuspenseRoute>} />
        <Route path={ROUTES.HISTORY} element={<SuspenseRoute><CardHistoryWithRestore /></SuspenseRoute>} />
        <Route path={ROUTES.SETTINGS} element={<SuspenseRoute><Pages.Settings /></SuspenseRoute>} />
        <Route path={ROUTES.USERS} element={<SuspenseRoute><Pages.UserManagementPage /></SuspenseRoute>} />
        <Route path={ROUTES.NAMESPACES} element={<SuspenseRoute><Pages.NamespaceManager /></SuspenseRoute>} />
        <Route path={ROUTES.ARCADE} element={<SuspenseRoute><Pages.Arcade /></SuspenseRoute>} />
        <Route path={ROUTES.DEPLOY} element={<SuspenseRoute><Pages.Deploy /></SuspenseRoute>} />
        <Route path={ROUTES.AI_ML} element={<SuspenseRoute><Pages.AIML /></SuspenseRoute>} />
        <Route path={ROUTES.AI_AGENTS} element={<SuspenseRoute><Pages.AIAgents /></SuspenseRoute>} />
        <Route path={ROUTES.LLM_D_BENCHMARKS} element={<SuspenseRoute><Pages.LLMdBenchmarks /></SuspenseRoute>} />
        <Route path={ROUTES.CLUSTER_ADMIN} element={<SuspenseRoute><Pages.ClusterAdmin /></SuspenseRoute>} />
        <Route path={ROUTES.CI_CD} element={<SuspenseRoute><Pages.CICD /></SuspenseRoute>} />
        <Route path={ROUTES.INSIGHTS} element={<SuspenseRoute><Pages.Insights /></SuspenseRoute>} />
        <Route path={ROUTES.MULTI_TENANCY} element={<SuspenseRoute><Pages.MultiTenancy /></SuspenseRoute>} />
        <Route path={ROUTES.DRASI} element={<SuspenseRoute><Pages.Drasi /></SuspenseRoute>} />
        <Route path={ROUTES.ACMM} element={<SuspenseRoute><Pages.ACMM /></SuspenseRoute>} />
        <Route path={ROUTES.MARKETPLACE} element={<SuspenseRoute><Pages.Marketplace /></SuspenseRoute>} />
        <Route path={ROUTES.QUANTUM} element={<SuspenseRoute><Pages.Quantum /></SuspenseRoute>} />
        {/* Dev test routes for unified framework validation */}
        <Route path={ROUTES.TEST_UNIFIED_CARD} element={<Pages.UnifiedCardTest />} />
        <Route path={ROUTES.TEST_UNIFIED_STATS} element={<Pages.UnifiedStatsTest />} />
        <Route path={ROUTES.TEST_UNIFIED_DASHBOARD} element={<Pages.UnifiedDashboardTest />} />
        {/* Mission landing pages live outside ProtectedRoute; /missions is handled by the dashboard Layout route above. */}
        {/* /issue, /issues, /feedback open the feedback modal on the dashboard */}
        <Route path={ROUTES.ISSUE} element={<IssueRedirect />} />
        <Route path={ROUTES.ISSUES} element={<IssueRedirect />} />
        <Route path={ROUTES.FEEDBACK} element={<IssueRedirect />} />
        {/* /feature, /features open the feedback modal on the feature tab */}
        <Route path={ROUTES.FEATURE} element={<FeatureRedirect />} />
        <Route path={ROUTES.FEATURES} element={<FeatureRedirect />} />
        <Route path="*" element={<SuspenseRoute><Pages.NotFound /></SuspenseRoute>} />
      </Route>

      <Route path="*" element={<SuspenseRoute><Pages.NotFound /></SuspenseRoute>} />
    </>
  )
}

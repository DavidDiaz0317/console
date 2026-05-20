import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { useMissions } from "../../hooks/useMissions";
import { useDemoMode, getDemoMode } from "../../hooks/useDemoMode";
import { useKagentBackend } from "../../hooks/useKagentBackend";
import type { AgentInfo, AgentProvider } from "../../types/agent";
import { PROVIDER_PREREQUISITES } from "../../types/agent";
import { cn } from "../../lib/cn";
import { useModalState } from "../../lib/modals";
import { safeGetItem, safeSetItem } from "../../lib/utils/localStorage";
import { AgentApprovalDialog, hasApprovedAgents } from "./AgentApprovalDialog";
import { ClusterSelectionDialog } from "../missions/ClusterSelectionDialog";
import { AgentInstallGuide } from "./AgentInstallGuide";
import { AgentSelectorDropdown } from "./AgentSelectorDropdown";
import { useAgentConnection } from "./useAgentConnection";
import { useInstallMission } from "./useInstallMission";
import {
  CLUSTER_PROVIDER_KEYS,
  buildVisibleAgents,
  sectionAgents,
} from "./agentSelectorUtils";

/** Map agent names to their backend provider key for prerequisite lookup */
const AGENT_TO_PROVIDER_KEY: Record<string, string> = {
  vscode: "vscode",
  antigravity: "antigravity",
};

const PREV_AGENT_KEY = "kc_previous_agent";

const CLUSTER_PROVIDERS: Set<AgentProvider> = new Set(CLUSTER_PROVIDER_KEYS);

const ALWAYS_SHOW_CLI: AgentInfo[] = [
  {
    name: "goose",
    displayName: "Goose",
    description: "Open-source AI agent by Block with MCP support",
    provider: "block",
    available: false,
    installUrl: "https://github.com/block/goose",
  },
  {
    name: "copilot-cli",
    displayName: "Copilot CLI",
    description: "GitHub Copilot in the terminal",
    provider: "github-cli",
    available: false,
    installUrl: "https://docs.github.com/en/copilot/github-copilot-in-the-cli",
  },
];

interface AgentSelectorProps {
  compact?: boolean;
  className?: string;
}

export function AgentSelector({
  compact = false,
  className = "",
}: AgentSelectorProps) {
  const { t } = useTranslation();
  const {
    agents,
    selectedAgent,
    agentsLoading,
    selectAgent,
    connectToAgent,
    startMission,
    openSidebar,
  } = useMissions();
  const { isDemoMode: isDemoModeHook } = useDemoMode();
  const {
    kagentAvailable,
    kagentiAvailable,
    selectedKagentAgent,
    selectedKagentiAgent,
    activeBackend,
    hasPolled,
  } = useKagentBackend();
  const isDemoMode = isDemoModeHook || getDemoMode();
  const { isOpen, close: closeDropdown, toggle: toggleDropdown } = useModalState();
  const previousAgentRef = useRef<string | null>(
    typeof window !== "undefined" ? safeGetItem(PREV_AGENT_KEY) : null,
  );
  const [showApproval, setShowApproval] = useState(false);
  const pendingAgentRef = useRef<string | null>(null);

  const visibleAgents = useMemo(
    () =>
      buildVisibleAgents(agents, ALWAYS_SHOW_CLI, {
        kagentAvailable,
        kagentiAvailable,
        selectedKagentAgent,
        selectedKagentiAgent,
      }),
    [
      agents,
      kagentiAvailable,
      kagentAvailable,
      selectedKagentAgent,
      selectedKagentiAgent,
    ],
  );
  const { selectedAgentInfo, cliAgents, clusterAgents } = useMemo(
    () => sectionAgents(visibleAgents, selectedAgent, CLUSTER_PROVIDERS),
    [selectedAgent, visibleAgents],
  );
  const sortedAgents = useMemo(() => {
    const list: AgentInfo[] = [];
    if (selectedAgentInfo) list.push(selectedAgentInfo);
    list.push(...cliAgents, ...clusterAgents);
    return list;
  }, [cliAgents, clusterAgents, selectedAgentInfo]);
  const currentAgent =
    visibleAgents.find((agent) => agent.name === selectedAgent) || visibleAgents[0];
  const hasAvailableAgents = visibleAgents.some((agent) => agent.available);
  const hasCliAgent = agents.some((agent) => agent.available);
  const {
    installGuide,
    installGuideLoading,
    installGuideError,
    installGuideShowRaw,
    setInstallGuideShowRaw,
    clearInstallGuide,
    openInstallGuide,
    handleInstallMission,
    runInstallGuide,
    pendingInstall,
    completePendingInstall,
    cancelPendingInstall,
  } = useInstallMission({ closeDropdown, startMission, openSidebar });
  const {
    dropdownRef,
    buttonRef,
    panelRef,
    dropdownPos,
    connectionState,
    startAgentConnection,
    retryConnection,
    dismissConnection,
  } = useAgentConnection({
    isDemoMode,
    activeBackend,
    isOpen,
    agentsCount: agents.length,
    agentsLoading,
    closeDropdown,
    connectToAgent,
  });

  useEffect(() => {
    if (isDemoMode) return;
    if (agents.length > 0) return;

    const isClusterBackendSelected =
      selectedAgent === "kagenti" || selectedAgent === "kagent";
    if (isClusterBackendSelected) return;

    if (kagentiAvailable) {
      selectAgent("kagenti");
    } else if (kagentAvailable) {
      selectAgent("kagent");
    }
  }, [
    agents.length,
    isDemoMode,
    kagentiAvailable,
    kagentAvailable,
    selectAgent,
    selectedAgent,
  ]);

  const activateAgent = useCallback(
    (agentName: string) => {
      const providerKey = AGENT_TO_PROVIDER_KEY[agentName];
      if (providerKey && PROVIDER_PREREQUISITES[providerKey]) {
        selectAgent(agentName);
        startAgentConnection(agentName);
        return;
      }

      selectAgent(agentName);
      closeDropdown();
    },
    [closeDropdown, selectAgent, startAgentConnection],
  );

  const handleSelect = useCallback(
    (agentName: string) => {
      if (agentName !== "none" && !hasApprovedAgents()) {
        pendingAgentRef.current = agentName;
        setShowApproval(true);
        return;
      }

      activateAgent(agentName);
    },
    [activateAgent],
  );

  const handleToggleAiAgent = useCallback(() => {
    if (selectedAgent === "none") {
      const prev = previousAgentRef.current;
      const restored = prev
        ? sortedAgents.find((agent) => agent.name === prev && agent.available)
        : undefined;
      const targetAgent =
        restored?.name || sortedAgents.find((agent) => agent.available)?.name || "";

      if (!targetAgent) return;

      if (!hasApprovedAgents()) {
        pendingAgentRef.current = targetAgent;
        setShowApproval(true);
        return;
      }

      handleSelect(targetAgent);
      return;
    }

    previousAgentRef.current = selectedAgent || null;
    if (selectedAgent) {
      safeSetItem(PREV_AGENT_KEY, selectedAgent);
    }
    handleSelect("none");
  }, [handleSelect, selectedAgent, sortedAgents]);

  const handleApprove = useCallback(() => {
    setShowApproval(false);
    const target = pendingAgentRef.current;
    pendingAgentRef.current = null;
    if (target) {
      activateAgent(target);
    }
  }, [activateAgent]);

  const connectionPrerequisite = useMemo(() => {
    if (!connectionState.provider) return null;

    const providerKey = AGENT_TO_PROVIDER_KEY[connectionState.provider] ?? "";
    const prerequisite = PROVIDER_PREREQUISITES[providerKey];
    return prerequisite
      ? { label: prerequisite.label, installUrl: prerequisite.installUrl }
      : null;
  }, [connectionState.provider]);

  const hasClusterAgents = kagentAvailable || kagentiAvailable;
  if (!hasPolled && !isDemoMode && agents.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 text-sm text-muted-foreground",
          className,
        )}
      >
        <Loader2 className="w-4 h-4 animate-spin" />
        {!compact && <span>{t("common.loading")}</span>}
      </div>
    );
  }

  if (agentsLoading && !isDemoMode && !hasClusterAgents) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 text-sm text-muted-foreground",
          className,
        )}
      >
        <Loader2 className="w-4 h-4 animate-spin" />
        {!compact && <span>{t("common.loading")}</span>}
      </div>
    );
  }

  if (agents.length === 0 && !agentsLoading && !isDemoMode && !hasClusterAgents) {
    return null;
  }

  return (
    <>
      <AgentSelectorDropdown
        compact={compact}
        className={className}
        isDemoMode={isDemoMode}
        isGreyedOut={isDemoMode}
        isOpen={isOpen}
        dropdownPos={dropdownPos}
        dropdownRef={dropdownRef}
        buttonRef={buttonRef}
        panelRef={panelRef}
        isNoneSelected={selectedAgent === "none"}
        hasAvailableAgents={hasAvailableAgents}
        currentAgent={currentAgent}
        sortedAgents={sortedAgents}
        hasCliAgent={hasCliAgent}
        selectedAgentInfo={selectedAgentInfo}
        cliAgents={cliAgents}
        clusterAgents={clusterAgents}
        selectedAgent={selectedAgent}
        connectionState={connectionState}
        agentsLoading={agentsLoading}
        prerequisiteLink={connectionPrerequisite}
        onToggleDropdown={toggleDropdown}
        onSelect={handleSelect}
        onToggleAiAgent={handleToggleAiAgent}
        onOpenInstallGuide={(missionId) => {
          void openInstallGuide(missionId);
        }}
        onInstallWithAi={(missionId, displayName) => {
          void handleInstallMission(missionId, displayName);
        }}
        onRetryConnection={retryConnection}
        onDismissConnection={dismissConnection}
        onReconnect={connectToAgent}
      />
      <AgentApprovalDialog
        isOpen={showApproval}
        agents={agents}
        onApprove={handleApprove}
        onCancel={() => {
          setShowApproval(false);
          pendingAgentRef.current = null;
        }}
      />
      <AgentInstallGuide
        installGuide={installGuide}
        installGuideLoading={installGuideLoading}
        installGuideError={installGuideError}
        installGuideShowRaw={installGuideShowRaw}
        onToggleRaw={() => setInstallGuideShowRaw((prev) => !prev)}
        onImport={runInstallGuide}
        onClose={clearInstallGuide}
      />
      {pendingInstall && (
        <ClusterSelectionDialog
          open
          missionTitle={`Install ${pendingInstall.displayName}`}
          onSelect={completePendingInstall}
          onCancel={cancelPendingInstall}
        />
      )}
    </>
  );
}

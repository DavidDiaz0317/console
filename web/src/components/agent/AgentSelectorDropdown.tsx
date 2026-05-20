import type { RefObject } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronDown,
  ExternalLink,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { AgentIcon } from "./AgentIcon";
import { cn } from "../../lib/cn";
import { sanitizeUrl } from "../../lib/utils/sanitizeUrl";
import type { AgentInfo, ProviderConnectionState } from "../../types/agent";
import type { DropdownPosition } from "./useAgentConnection";

interface AgentSelectorDropdownProps {
  compact: boolean;
  className: string;
  isDemoMode: boolean;
  isGreyedOut: boolean;
  isOpen: boolean;
  dropdownPos: DropdownPosition | null;
  dropdownRef: RefObject<HTMLDivElement | null>;
  buttonRef: RefObject<HTMLButtonElement | null>;
  panelRef: RefObject<HTMLDivElement | null>;
  isNoneSelected: boolean;
  hasAvailableAgents: boolean;
  currentAgent?: AgentInfo;
  sortedAgents: AgentInfo[];
  hasCliAgent: boolean;
  selectedAgentInfo: AgentInfo | null;
  cliAgents: AgentInfo[];
  clusterAgents: AgentInfo[];
  selectedAgent: string | null;
  connectionState: ProviderConnectionState;
  agentsLoading: boolean;
  prerequisiteLink: { label: string; installUrl: string } | null;
  onToggleDropdown: () => void;
  onSelect: (agentName: string) => void;
  onToggleAiAgent: () => void;
  onOpenInstallGuide: (missionId: string) => void;
  onInstallWithAi: (missionId: string, displayName: string) => void;
  onRetryConnection: () => void;
  onDismissConnection: () => void;
  onReconnect: () => void;
}

export function AgentSelectorDropdown({
  compact,
  className,
  isDemoMode,
  isGreyedOut,
  isOpen,
  dropdownPos,
  dropdownRef,
  buttonRef,
  panelRef,
  isNoneSelected,
  hasAvailableAgents,
  currentAgent,
  sortedAgents,
  hasCliAgent,
  selectedAgentInfo,
  cliAgents,
  clusterAgents,
  selectedAgent,
  connectionState,
  agentsLoading,
  prerequisiteLink,
  onToggleDropdown,
  onSelect,
  onToggleAiAgent,
  onOpenInstallGuide,
  onInstallWithAi,
  onRetryConnection,
  onDismissConnection,
  onReconnect,
}: AgentSelectorDropdownProps) {
  const { t } = useTranslation();

  const renderAgentRow = (agent: AgentInfo) => (
    <div
      key={agent.name}
      role="option"
      aria-selected={agent.name === selectedAgent}
      aria-disabled={!agent.available}
      tabIndex={agent.available ? 0 : -1}
      className={cn(
        "w-full flex items-start gap-3 px-3 py-2 text-left transition-colors",
        agent.available ? "hover:bg-secondary cursor-pointer" : "cursor-default",
        agent.name === selectedAgent && "bg-primary/10",
      )}
      onClick={() => agent.available && onSelect(agent.name)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (agent.available) onSelect(agent.name);
        }
      }}
    >
      <AgentIcon
        provider={agent.provider}
        className={cn("w-5 h-5 mt-0.5 shrink-0", !agent.available && "opacity-40")}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-sm font-medium",
              agent.name === selectedAgent
                ? "text-primary"
                : agent.available
                  ? "text-foreground"
                  : "text-muted-foreground",
            )}
          >
            {agent.displayName}
          </span>
          {agent.name === selectedAgent && (
            <Check className="w-4 h-4 text-primary shrink-0" />
          )}
        </div>
        <p
          className={cn(
            "text-xs",
            agent.available ? "text-muted-foreground" : "text-muted-foreground/60",
          )}
        >
          {agent.description}
        </p>
        {agent.model ? (
          <span className="text-2xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
            {agent.model}
          </span>
        ) : agent.provider === "github-cli" ? (
          <span className="text-2xs text-muted-foreground italic">Default model</span>
        ) : null}
        {!agent.available && agent.installMissionId && (
          <div className="flex items-center gap-2 mt-1">
            <button
              onClick={(event) => {
                event.stopPropagation();
                onOpenInstallGuide(agent.installMissionId);
              }}
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              <BookOpen className="w-3 h-3" />
              Install guide
            </button>
            {hasCliAgent && (
              <>
                <span className="text-xs text-muted-foreground/40">|</span>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    onInstallWithAi(agent.installMissionId, agent.displayName);
                  }}
                  className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors"
                >
                  <Play className="w-3 h-3" />
                  Install with AI
                </button>
              </>
            )}
          </div>
        )}
        {!agent.available && agent.installUrl && !agent.installMissionId && (
          <a
            href={sanitizeUrl(agent.installUrl)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors mt-1"
          >
            <BookOpen className="w-3 h-3" />
            Install
          </a>
        )}
      </div>
    </div>
  );

  return (
    <div
      ref={dropdownRef}
      className={cn(
        "relative flex items-center gap-1",
        className,
        isGreyedOut && "opacity-40 pointer-events-none",
      )}
    >
      <button
        ref={buttonRef}
        onClick={() => !isDemoMode && onToggleDropdown()}
        aria-label={t("agent.selectAgent")}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={cn(
          "flex items-center rounded-lg border transition-colors",
          compact ? "p-1.5 gap-1" : "px-3 py-1.5 h-9 gap-2",
          "bg-secondary/50 border-border hover:bg-secondary",
          isOpen && "ring-1 ring-primary",
        )}
      >
        {isNoneSelected ? (
          <Sparkles className="w-4 h-4 text-muted-foreground" />
        ) : hasAvailableAgents && currentAgent ? (
          <AgentIcon provider={currentAgent.provider} className="w-4 h-4" />
        ) : (
          <AgentIcon provider="default" className="w-4 h-4" />
        )}
        {!compact && (
          <span className="text-sm font-medium text-foreground truncate max-w-[120px]">
            {isNoneSelected
              ? t("agent.noneAgent")
              : hasAvailableAgents && currentAgent
                ? currentAgent.displayName
                : "AI Agent"}
          </span>
        )}
        <ChevronDown
          className={cn(
            "w-4 h-4 text-muted-foreground transition-transform",
            isOpen && "rotate-180",
          )}
        />
      </button>

      {isOpen &&
        dropdownPos &&
        createPortal(
          <div
            ref={panelRef}
            role="listbox"
            aria-label={t("agent.selectAgent")}
            className="fixed z-modal w-96 max-h-[calc(100vh-8rem)] rounded-lg bg-card border border-border shadow-lg overflow-hidden flex flex-col"
            style={{ top: dropdownPos.top, right: dropdownPos.right }}
            onKeyDown={(event) => {
              if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
              event.preventDefault();
              const items = event.currentTarget.querySelectorAll<HTMLElement>(
                '[role="option"]:not([aria-disabled="true"])',
              );
              const idx = Array.from(items).indexOf(
                document.activeElement as HTMLElement,
              );
              if (event.key === "ArrowDown") {
                items[Math.min(idx + 1, items.length - 1)]?.focus();
              } else {
                items[Math.max(idx - 1, 0)]?.focus();
              }
            }}
          >
            <div className="px-3 py-3 border-b border-border shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles
                    className={cn(
                      "w-4 h-4",
                      isNoneSelected ? "text-muted-foreground" : "text-primary",
                    )}
                  />
                  <div>
                    <span className="text-sm font-medium text-foreground">
                      {t("agent.aiAgentToggle")}
                    </span>
                    <p className="text-xs text-muted-foreground">
                      {isNoneSelected ? t("agent.noneAgentDesc") : t("agent.aiAgentOnDesc")}
                    </p>
                  </div>
                </div>
                <button
                  role="switch"
                  aria-checked={!isNoneSelected}
                  onClick={onToggleAiAgent}
                  className={cn(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0",
                    !isNoneSelected ? "bg-primary" : "bg-secondary",
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-4 w-4 transform rounded-full bg-white dark:bg-gray-200 transition-transform",
                      !isNoneSelected ? "translate-x-6" : "translate-x-1",
                    )}
                  />
                </button>
              </div>
            </div>

            {sortedAgents.length > 0 && (
              <div className="py-1 overflow-y-auto min-h-0">
                {selectedAgentInfo && renderAgentRow(selectedAgentInfo)}

                {cliAgents.length > 0 && (
                  <>
                    <div className="px-3 pt-2 pb-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                        CLI Agents
                      </span>
                    </div>
                    {cliAgents.map(renderAgentRow)}
                  </>
                )}

                {clusterAgents.length > 0 && (
                  <>
                    <div className="px-3 pt-2 pb-1 border-t border-border/50 mt-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                        Cluster Agents
                      </span>
                    </div>
                    {clusterAgents.map(renderAgentRow)}
                  </>
                )}
              </div>
            )}

            {connectionState.phase !== "idle" && (
              <div className="px-3 py-3 border-t border-border bg-secondary/20">
                {(connectionState.phase === "starting" ||
                  connectionState.phase === "handshake") && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-yellow-400 shrink-0" />
                      <span className="text-sm font-medium text-foreground">
                        {connectionState.phase === "starting"
                          ? t("agent.providerStarting", {
                              provider: connectionState.provider,
                            })
                          : t("agent.providerHandshake", {
                              provider: connectionState.provider,
                            })}
                      </span>
                    </div>
                    {connectionState.prerequisite && (
                      <p className="text-xs text-muted-foreground ml-6">
                        {connectionState.prerequisite}
                      </p>
                    )}
                    {connectionState.error && (
                      <p className="text-xs text-yellow-400 ml-6">
                        {connectionState.error}
                      </p>
                    )}
                  </div>
                )}

                {connectionState.phase === "connected" && (
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-400 shrink-0" />
                    <span className="text-sm font-medium text-green-400">
                      {t("agent.providerConnected", {
                        provider: connectionState.provider,
                      })}
                    </span>
                  </div>
                )}

                {connectionState.phase === "failed" && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                      <span className="text-sm font-medium text-red-400">
                        {t("agent.providerFailed", {
                          provider: connectionState.provider,
                        })}
                      </span>
                    </div>
                    {connectionState.error && (
                      <p className="text-xs text-muted-foreground ml-6">
                        {connectionState.error}
                      </p>
                    )}
                    {connectionState.prerequisites.length > 0 && (
                      <ul className="ml-6 space-y-1">
                        {connectionState.prerequisites.map((prerequisite, index) => (
                          <li
                            key={`${prerequisite}-${index}`}
                            className="flex items-start gap-1.5 text-xs text-muted-foreground"
                          >
                            <span className="text-muted-foreground/60 mt-0.5">
                              -
                            </span>
                            <span>{prerequisite}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {connectionState.prerequisites.length === 0 &&
                      prerequisiteLink && (
                        <div className="ml-6 space-y-1">
                          <p className="text-xs text-muted-foreground">
                            {t("agent.providerPrerequisite")}:
                          </p>
                          <a
                            href={prerequisiteLink.installUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                          >
                            <ExternalLink className="w-3 h-3" />
                            {prerequisiteLink.label}
                          </a>
                        </div>
                      )}
                    <div className="flex items-center gap-2 ml-6">
                      <button
                        onClick={onRetryConnection}
                        className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                      >
                        <RefreshCw className="w-3 h-3" />
                        {t("agent.providerRetry")}
                      </button>
                      <span className="text-xs text-muted-foreground/40">|</span>
                      <button
                        onClick={onDismissConnection}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        {t("actions.dismiss")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {sortedAgents.length === 0 && (
              <div className="py-4 text-center">
                {agentsLoading ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{t("agent.connectingToAgent")}</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      {t("agent.noAgentsAvailable")}
                    </p>
                    <button
                      onClick={onReconnect}
                      className="text-xs text-primary hover:underline"
                    >
                      Retry connection
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

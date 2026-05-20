import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { MissionDetailView } from "../missions/MissionDetailView";
import type { InstallGuideState } from "./useInstallMission";

interface AgentInstallGuideProps {
  installGuide: InstallGuideState | null;
  installGuideLoading: boolean;
  installGuideError: boolean;
  installGuideShowRaw: boolean;
  onToggleRaw: () => void;
  onImport: () => void;
  onClose: () => void;
}

export function AgentInstallGuide({
  installGuide,
  installGuideLoading,
  installGuideError,
  installGuideShowRaw,
  onToggleRaw,
  onImport,
  onClose,
}: AgentInstallGuideProps) {
  const { t } = useTranslation();

  if (!installGuide && !installGuideLoading && !installGuideError) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-xs"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onClose();
        }
      }}
      tabIndex={-1}
      ref={(element) => element?.focus()}
    >
      <div className="relative bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col w-[900px] max-h-[85vh]">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="flex-1 overflow-y-auto scroll-enhanced p-6">
          {installGuideLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : installGuideError ? (
            <div
              role="alert"
              className="flex flex-col items-center justify-center py-12 gap-3 text-center"
            >
              <p className="text-sm text-red-400">
                {t("agent.installGuideLoadError", "Failed to load install guide")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t(
                  "agent.installGuideLoadErrorHint",
                  "Check your connection or try again later",
                )}
              </p>
            </div>
          ) : installGuide ? (
            <MissionDetailView
              mission={installGuide.mission}
              rawContent={installGuide.raw}
              showRaw={installGuideShowRaw}
              onToggleRaw={onToggleRaw}
              onImport={onImport}
              onBack={onClose}
              importLabel="Run"
              hideBackButton
            />
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

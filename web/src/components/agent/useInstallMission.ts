import { useState } from "react";
import type { StartMissionParams } from "../../hooks/useMissionTypes";
import type { MissionExport } from "../../lib/missions/types";

/** Timeout (ms) for fetching mission install guide files from the API */
const MISSION_FILE_FETCH_TIMEOUT_MS = 5_000;

const INSTALL_MISSION_PATHS: Record<string, string[]> = {
  "install-kagent": ["fixes/cncf-install/install-kagent.json"],
  "install-kagenti": ["fixes/platform-install/install-kagenti.json"],
};

export interface InstallGuideState {
  mission: MissionExport;
  raw: string;
}

export interface PendingInstallState {
  missionId: string;
  displayName: string;
  mission: MissionExport;
}

interface UseInstallMissionParams {
  closeDropdown: () => void;
  startMission: (params: StartMissionParams) => string;
  openSidebar: () => void;
}

function getInstallMissionPaths(missionId: string): string[] {
  return INSTALL_MISSION_PATHS[missionId] || [
    `fixes/cncf-install/${missionId}.json`,
    `fixes/platform-install/${missionId}.json`,
  ];
}

async function fetchInstallMissionFile(
  missionId: string,
  fallbackTitle: string,
): Promise<InstallGuideState | null> {
  const paths = getInstallMissionPaths(missionId);

  for (const path of paths) {
    try {
      const res = await fetch(`/api/missions/file?path=${encodeURIComponent(path)}`, {
        signal: AbortSignal.timeout(MISSION_FILE_FETCH_TIMEOUT_MS),
      });
      if (!res.ok) continue;

      const raw = await res.text();
      const parsed = JSON.parse(raw) as {
        version?: string;
        title?: string;
        description?: string;
        type?: MissionExport["type"];
        steps?: MissionExport["steps"];
        uninstall?: MissionExport["uninstall"];
        upgrade?: MissionExport["upgrade"];
        troubleshooting?: MissionExport["troubleshooting"];
        tags?: MissionExport["tags"];
        mission?: Partial<MissionExport>;
      };
      const nested = parsed.mission || {};
      const mission: MissionExport = {
        version: parsed.version || "1.0",
        title: nested.title || parsed.title || fallbackTitle,
        description: nested.description || parsed.description || "",
        type: nested.type || parsed.type || "deploy",
        steps: nested.steps || parsed.steps || [],
        uninstall: nested.uninstall || parsed.uninstall,
        upgrade: nested.upgrade || parsed.upgrade,
        troubleshooting: nested.troubleshooting || parsed.troubleshooting,
        tags: nested.tags || parsed.tags || [],
        missionClass: "install",
      };

      return { mission, raw };
    } catch {
      continue;
    }
  }

  return null;
}

export function useInstallMission({
  closeDropdown,
  startMission,
  openSidebar,
}: UseInstallMissionParams) {
  const [installGuide, setInstallGuide] = useState<InstallGuideState | null>(null);
  const [installGuideLoading, setInstallGuideLoading] = useState(false);
  const [installGuideError, setInstallGuideError] = useState(false);
  const [installGuideShowRaw, setInstallGuideShowRaw] = useState(false);
  const [pendingInstall, setPendingInstall] = useState<PendingInstallState | null>(null);

  const clearInstallGuide = () => {
    setInstallGuide(null);
    setInstallGuideLoading(false);
    setInstallGuideError(false);
    setInstallGuideShowRaw(false);
  };

  const openInstallGuide = async (missionId: string) => {
    closeDropdown();
    setInstallGuideLoading(true);
    setInstallGuideError(false);

    const guide = await fetchInstallMissionFile(missionId, missionId);
    if (guide) {
      setInstallGuide(guide);
      setInstallGuideLoading(false);
      return;
    }

    setInstallGuideError(true);
    setInstallGuideLoading(false);
  };

  const handleInstallMission = async (missionId: string, displayName: string) => {
    closeDropdown();

    const missionData = await fetchInstallMissionFile(missionId, displayName);
    if (!missionData) {
      startMission({
        title: `Install ${displayName}`,
        description: `Install ${displayName} in the cluster`,
        type: "deploy",
        initialPrompt: `Install ${displayName} in the cluster`,
      });
      return;
    }

    setPendingInstall({
      missionId,
      displayName,
      mission: {
        ...missionData.mission,
        title: missionData.mission.title || displayName,
        description: missionData.mission.description || `Install ${displayName}`,
        type: missionData.mission.type || "deploy",
        tags: missionData.mission.tags || [],
        steps: missionData.mission.steps || [],
      },
    });
  };

  const runInstallGuide = () => {
    if (!installGuide) return;

    const missionId = installGuide.mission.title.toLowerCase().includes("kagenti")
      ? "install-kagenti"
      : "install-kagent";

    void handleInstallMission(missionId, installGuide.mission.title);
    clearInstallGuide();
  };

  const completePendingInstall = (clusters: string[]) => {
    if (!pendingInstall) return;

    const mission = pendingInstall.mission;
    const stepsText =
      (mission.steps ?? [])
        .map(
          (step, index) =>
            `${index + 1}. ${step.title}${step.description ? `: ${step.description}` : ""}`,
        )
        .join("\n") || mission.description;

    startMission({
      title: `Install ${pendingInstall.displayName}`,
      description: mission.description,
      type: "deploy",
      cluster: clusters.length > 0 ? clusters.join(",") : undefined,
      initialPrompt: stepsText,
    });
    openSidebar();
    setPendingInstall(null);
  };

  return {
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
    cancelPendingInstall: () => setPendingInstall(null),
  };
}

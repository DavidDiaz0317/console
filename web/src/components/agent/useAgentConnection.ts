import { useEffect, useRef, useState } from "react";
import { useProviderConnection } from "../../hooks/useProviderConnection";

interface UseAgentConnectionParams {
  isDemoMode: boolean;
  activeBackend: string;
  isOpen: boolean;
  agentsCount: number;
  agentsLoading: boolean;
  closeDropdown: () => void;
  connectToAgent: () => void;
}

export interface DropdownPosition {
  top: number;
  right: number;
}

export function useAgentConnection({
  isDemoMode,
  activeBackend,
  isOpen,
  agentsCount,
  agentsLoading,
  closeDropdown,
  connectToAgent,
}: UseAgentConnectionParams) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState<DropdownPosition | null>(null);
  const {
    connectionState,
    startConnection,
    retry,
    reset: resetConnection,
    dismiss: dismissConnection,
  } = useProviderConnection();

  useEffect(() => {
    if (!isDemoMode && activeBackend === "kc-agent") {
      connectToAgent();
    }
  }, [activeBackend, connectToAgent, isDemoMode]);

  useEffect(() => {
    if (
      isOpen &&
      agentsCount === 0 &&
      !agentsLoading &&
      !isDemoMode &&
      activeBackend === "kc-agent"
    ) {
      connectToAgent();
    }
  }, [
    activeBackend,
    agentsCount,
    agentsLoading,
    connectToAgent,
    isDemoMode,
    isOpen,
  ]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        (!panelRef.current || !panelRef.current.contains(target))
      ) {
        closeDropdown();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [closeDropdown]);

  useEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      const DROPDOWN_GAP_PX = 4;
      setDropdownPos({
        top: rect.bottom + DROPDOWN_GAP_PX,
        right: window.innerWidth - rect.right,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, {
      capture: true,
      passive: true,
    });

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, { capture: true });
    };
  }, [isOpen]);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeDropdown();
      }
    }

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [closeDropdown, isOpen]);

  useEffect(() => {
    if (isDemoMode) {
      closeDropdown();
    }
  }, [closeDropdown, isDemoMode]);

  useEffect(() => {
    if (!isOpen && connectionState.phase !== "idle") {
      resetConnection();
    }
  }, [connectionState.phase, isOpen, resetConnection]);

  return {
    dropdownRef,
    buttonRef,
    panelRef,
    dropdownPos,
    connectionState,
    startAgentConnection: (providerName: string) => {
      void startConnection(providerName, closeDropdown);
    },
    retryConnection: () => retry(closeDropdown),
    dismissConnection,
  };
}

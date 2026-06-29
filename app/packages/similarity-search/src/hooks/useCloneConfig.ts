import { atom, useAtom } from "jotai";
import { useCallback } from "react";
import { CloneConfig } from "../types";

const cloneConfigAtom = atom<CloneConfig | null>(null);

type UseCloneConfigResult = {
  cloneConfig: CloneConfig | null;
  setCloneConfig: (config: CloneConfig) => void;
  clearCloneConfig: () => void;
};

/**
 * Hook for managing the clone config state.
 */
export const useCloneConfig = (): UseCloneConfigResult => {
  const [cloneConfig, setCloneConfigAtom] = useAtom(cloneConfigAtom);

  const setCloneConfig = useCallback(
    (config: CloneConfig) => {
      setCloneConfigAtom(config);
    },
    [setCloneConfigAtom],
  );

  const clearCloneConfig = useCallback(() => {
    setCloneConfigAtom(null);
  }, [setCloneConfigAtom]);

  return { cloneConfig, setCloneConfig, clearCloneConfig };
};

import { useAtom } from "jotai";
import { useCallback } from "react";
import atoms from "../state";
import { CloneConfig } from "../types";

type UseCloneConfigResult = {
  cloneConfig: CloneConfig | null;
  setCloneConfig: (config: CloneConfig) => void;
  clearCloneConfig: () => void;
};

/**
 * Hook for managing the clone config state.
 */
export const useCloneConfig = (): UseCloneConfigResult => {
  const [cloneConfig, setCloneConfigAtom] = useAtom(atoms.cloneConfig);

  const setCloneConfig = useCallback(
    (config: CloneConfig) => {
      setCloneConfigAtom(config);
    },
    [setCloneConfigAtom]
  );

  const clearCloneConfig = useCallback(() => {
    setCloneConfigAtom(null);
  }, [setCloneConfigAtom]);

  return { cloneConfig, setCloneConfig, clearCloneConfig };
};

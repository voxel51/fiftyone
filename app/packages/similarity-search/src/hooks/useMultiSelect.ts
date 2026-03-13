import { useCallback } from "react";
import { useAtom } from "jotai";
import atoms from "../state";

export const useMultiSelect = () => {
  const [selectMode, setSelectMode] = useAtom(atoms.selectMode);
  const [selectedRunIds, setSelectedRunIds] = useAtom(atoms.selectedRunIds);

  const toggleSelectMode = useCallback(() => {
    setSelectMode((prev) => {
      if (prev) {
        setSelectedRunIds(new Set());
      }
      return !prev;
    });
  }, [setSelectMode, setSelectedRunIds]);

  const toggleRunSelection = useCallback(
    (runId: string) => {
      setSelectedRunIds((prev) => {
        const next = new Set(prev);
        if (next.has(runId)) {
          next.delete(runId);
        } else {
          next.add(runId);
        }
        return next;
      });
    },
    [setSelectedRunIds]
  );

  const selectAll = useCallback(
    (visibleRunIds: string[]) => {
      setSelectedRunIds(new Set(visibleRunIds));
    },
    [setSelectedRunIds]
  );

  const deselectAll = useCallback(() => {
    setSelectedRunIds(new Set());
  }, [setSelectedRunIds]);

  const clearAndExit = useCallback(() => {
    setSelectedRunIds(new Set());
    setSelectMode(false);
  }, [setSelectedRunIds, setSelectMode]);

  return {
    selectMode,
    selectedRunIds,
    toggleSelectMode,
    toggleRunSelection,
    selectAll,
    deselectAll,
    clearAndExit,
  };
};

import { useCallback } from "react";
import { atom, useAtom } from "jotai";

const selectModeAtom = atom<boolean>(false);
const selectedRunIdsAtom = atom<Set<string>>(new Set());

export const useMultiSelect = () => {
  const [selectMode, setSelectMode] = useAtom(selectModeAtom);
  const [selectedRunIds, setSelectedRunIds] = useAtom(selectedRunIdsAtom);

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
    [setSelectedRunIds],
  );

  const selectAll = useCallback(
    (visibleRunIds: string[]) => {
      setSelectedRunIds(new Set(visibleRunIds));
    },
    [setSelectedRunIds],
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

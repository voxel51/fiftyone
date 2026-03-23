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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const selectAll = useCallback(
    (visibleRunIds: string[]) => {
      setSelectedRunIds(new Set(visibleRunIds));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const deselectAll = useCallback(() => {
    setSelectedRunIds(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearAndExit = useCallback(() => {
    setSelectedRunIds(new Set());
    setSelectMode(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

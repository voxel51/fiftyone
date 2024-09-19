// todo: move to hooks?

import { useCallback } from 'react';

const refreshers = new Map();

function refresh(id: string) {
  const refresher = refreshers.get(id);
  if (typeof refresher === 'function') {
    refresher();
  }
}

function setRefresher(id: string, refresher: refresherType) {
  refreshers.set(id, refresher);
}

export default function useRefresher(
  id: string
): [() => void, (refresher: refresherType) => void] {
  const refreshForId = useCallback(() => {
    refresh(id);
  }, [id]);
  const setRefresherForId = useCallback(
    (refresher: refresherType) => {
      setRefresher(id, refresher);
    },
    [id]
  );
  return [refreshForId, setRefresherForId];
}

export const PINNED_RUNS_REFRESHER_ID = 'PINNED_RUNS_REFRESHER';
export const RUNS_STATUS_REFRESHER_ID = 'RUNS_STATUS_REFRESHER';

type refresherType = () => void;

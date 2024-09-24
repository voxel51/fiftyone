import { staleCacheStore } from '@fiftyone/teams-state';
import { useCallback, useMemo } from 'react';
import { useRecoilState } from 'recoil';

// This is a workaround hook for on-demand cache refresh
export default function useCacheStore(
  cacheKey: string
): [boolean, (state: boolean) => void] {
  const [staleCacheStoreState, setStaleCacheStoreState] =
    useRecoilState(staleCacheStore);

  const stale = useMemo(
    () => staleCacheStoreState.has(cacheKey),
    [staleCacheStoreState]
  );

  const setStale = useCallback(
    (state: boolean) => {
      const updatedCacheStore = new Set(staleCacheStoreState);
      if (state) updatedCacheStore.add(cacheKey);
      else updatedCacheStore.delete(cacheKey);
      setStaleCacheStoreState(updatedCacheStore);
    },
    [staleCacheStoreState, setStaleCacheStoreState]
  );

  return [stale, setStale];
}

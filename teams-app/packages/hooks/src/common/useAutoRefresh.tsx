import { AUTO_REFRESH_INTERVAL } from '@fiftyone/teams-state/src/constants';
import { useCallback, useRef } from 'react';

export default function useAutoRefresh(refresh: () => void, interval?: number) {
  const timer = useRef<NodeJS.Timeout>();

  const stop = useCallback(() => {
    clearInterval(timer.current);
    timer.current = undefined;
  }, []);

  const start = useCallback(() => {
    stop();
    timer.current = setInterval(refresh, interval ?? AUTO_REFRESH_INTERVAL);
  }, [refresh, stop]);

  return [start, stop];
}

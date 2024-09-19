import { useCallback, useRef } from 'react';

export default function useDebounceThrottle<T extends (...args: any[]) => void>(
  func: T,
  wait: number,
  limit: number
): T {
  const timeout = useRef<number | undefined>();
  const lastCall = useRef<number>(0);
  const inThrottle = useRef<boolean>(false);

  const debouncedThrottledFunc = useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();

      if (timeout.current) {
        clearTimeout(timeout.current);
      }

      timeout.current = window.setTimeout(() => {
        if (!inThrottle.current || now - lastCall.current >= limit) {
          func(...args);
          lastCall.current = now;
          inThrottle.current = true;

          window.setTimeout(() => {
            inThrottle.current = false;
          }, limit);
        }
      }, wait);
    },
    [func, wait, limit]
  );

  return debouncedThrottledFunc as T;
}

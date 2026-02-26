import { useCallback, useMemo } from "react";
import { atom, useAtom } from "jotai";

/**
 * Retry configuration.
 */
export type RetryConfig = {
  /**
   * Unique ID to identify this retryable instance.
   */
  id: string;

  /**
   * Maximum number of attempts.
   */
  maxAttempts: number;
};

/**
 * Utility which provides retry control flow logic.
 */
export interface RetryController {
  /**
   * If `true`, operation can be attempted.
   */
  canAttempt: boolean;

  /**
   * Record an attempt; this counts against the maximum number of attempts.
   */
  recordAttempt: () => void;

  /**
   * Reset the retry state.
   */
  reset: () => void;
}

/**
 * Internal storage for tracking retry state.
 */
const retryCountAtom = atom<Record<string, number>>({});

/**
 * Hook which returns a {@link RetryController} to support retryable flows.
 * @param id Unique ID to identify this retryable instance
 * @param maxAttempts Maximum number of attempts
 */
export const useRetryController = ({
  id,
  maxAttempts,
}: RetryConfig): RetryController => {
  const [retryCounts, setRetryCounts] = useAtom(retryCountAtom);

  const recordAttempt = useCallback(() => {
    setRetryCounts((prev) => ({
      ...prev,
      [id]: (prev[id] ?? 0) + 1,
    }));
  }, [id, setRetryCounts]);

  const reset = useCallback(() => {
    setRetryCounts((prev) => {
      const newData = { ...prev };
      delete newData[id];
      return newData;
    });
  }, [id, setRetryCounts]);

  return useMemo(
    () => ({
      canAttempt: (retryCounts[id] ?? 0) < maxAttempts,
      recordAttempt,
      reset,
    }),
    [id, maxAttempts, recordAttempt, reset, retryCounts]
  );
};

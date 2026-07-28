import { type RetryController, useRetryController } from "@fiftyone/state";
import { useCallback, useEffect, useMemo, useState } from "react";
import { v4 } from "uuid";

/**
 * Maximum number of attempts before triggering fallback behavior.
 */
const MAX_ATTEMPTS = 3;

/**
 * Fallback duration after attempts exceeded.
 */
const FALLBACK_TIMEOUT_PERIOD_MS = 30_000;

/**
 * {@link RetryController} which enforces request count and time constraints.
 */
export interface AnnotationRetryController extends RetryController {
  /**
   * If `true`, persistence is considered unhealthy and expected to fail.
   */
  isUnhealthy: boolean;
}

/**
 * Hook which returns an {@link AnnotationRetryController} which enforces
 * annotation persistence retry logic.
 */
export const usePersistenceRetryController = (): AnnotationRetryController => {
  const [canRetry, setCanRetry] = useState<boolean>(true);
  const [isUnhealthy, setIsUnhealthy] = useState<boolean>(false);

  // standard retry controller to track consecutive failed attempts
  const { canAttempt, recordAttempt, reset } = useRetryController({
    id: useMemo(() => v4(), []),
    maxAttempts: MAX_ATTEMPTS,
  });

  // helper to reset internal state
  const resetInternal = useCallback(() => {
    setCanRetry(true);
    setIsUnhealthy(false);
  }, [setCanRetry, setIsUnhealthy]);

  // When `canAttempt` transitions to false, start a timer to disable retries.
  useEffect(() => {
    if (!canAttempt) {
      const timeout = setTimeout(
        () => setCanRetry(false),
        FALLBACK_TIMEOUT_PERIOD_MS,
      );
      setIsUnhealthy(true);

      return () => {
        clearTimeout(timeout);
        setIsUnhealthy(false);
      };
    } else {
      resetInternal();
    }
  }, [canAttempt]);

  // reset internal and controlled state
  const resetController = useCallback(() => {
    reset();
    resetInternal();
  }, [reset, resetInternal]);

  return useMemo(
    () => ({
      canAttempt: canRetry,
      isUnhealthy,
      recordAttempt,
      reset: resetController,
    }),
    [canRetry, isUnhealthy, recordAttempt, resetController],
  );
};

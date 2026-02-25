import { type RetryController, useRetryController } from "@fiftyone/state";
import { useCallback, useEffect, useMemo, useState } from "react";
import { v4 } from "uuid";

/**
 * Continue retrying for 30 seconds after attempts exceeded.
 */
const RETRY_TIMEOUT_PERIOD_MS = 30_000;

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

  const { canAttempt, recordAttempt, reset } = useRetryController({
    id: useMemo(() => v4(), []),
    maxAttempts: 3,
  });

  // When `canAttempt` transitions to false, start a timer to disable retries.
  useEffect(() => {
    if (!canAttempt) {
      const timeout = setTimeout(
        () => setCanRetry(false),
        RETRY_TIMEOUT_PERIOD_MS
      );
      setIsUnhealthy(true);

      return () => {
        clearTimeout(timeout);
        setIsUnhealthy(false);
      };
    } else {
      setCanRetry(true);
      setIsUnhealthy(false);
    }
  }, [canAttempt]);

  const resetController = useCallback(() => {
    reset();
    setIsUnhealthy(false);
    setCanRetry(true);
  }, [reset, setCanRetry]);

  return useMemo(
    () => ({
      canAttempt: canRetry,
      isUnhealthy,
      recordAttempt,
      reset: resetController,
    }),
    [canRetry, isUnhealthy, recordAttempt, resetController]
  );
};

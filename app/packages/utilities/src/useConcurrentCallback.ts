import { useCallback, useRef } from "react";

/**
 * Supported behaviors when maximum concurrency has been reached.
 */
export enum ConcurrencyLimitBehavior {
  /**
   * If the maximum concurrency has been reached, drop the call.
   */
  DROP = "drop",
}

/**
 * Concurrency configuration.
 */
export type ConcurrencyConfig = {
  /**
   * Maximum allowed concurrency.
   */
  maxConcurrency: number;

  /**
   * Behavior when concurrency limit has been reached.
   */
  limitBehavior: ConcurrencyLimitBehavior;
};

/**
 * Result of a callback attempt.
 */
export type CallbackResult<T> = {
  /**
   * Result returned by the callback, if any.
   */
  result?: T;

  /**
   * Callback behavior.
   *
   * - `completed` - the callback was executed normally
   * - `dropped` - the callback was not executed
   */
  status: "completed" | "dropped";
};

/**
 * Hook which returns a callback which limits concurrent invocations of the
 * provided function.
 *
 * @param callback Function to wrap in concurrency constraints
 * @param config Concurrency config
 */
export const useConcurrentCallback = <
  R,
  T extends (...args: Parameters<T>) => Promise<R>
>(
  callback: T,
  config: ConcurrencyConfig
): ((...args: Parameters<T>) => Promise<CallbackResult<R>>) => {
  const inFlightCount = useRef<number>(0);

  return useCallback(
    async (...args: Parameters<T>): Promise<CallbackResult<R>> => {
      if (inFlightCount.current >= config.maxConcurrency) {
        if (config.limitBehavior === ConcurrencyLimitBehavior.DROP) {
          return { status: "dropped" };
        }

        throw new Error("unsupported concurrency behavior");
      } else {
        inFlightCount.current++;

        try {
          return {
            result: await callback(...args),
            status: "completed",
          };
        } finally {
          inFlightCount.current--;
        }
      }
    },
    [callback, config.limitBehavior, config.maxConcurrency]
  );
};

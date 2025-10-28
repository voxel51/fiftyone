/**
 * Returns a function that evaluates a predicate, and returns the fallback value
 * if the predicate returns false after the specified timeout.
 *
 * @param predicate - Function that returns a boolean
 * @param fallbackReturnValue - Value to return if predicate is false after timeout
 * @param timeoutMs - Time in milliseconds before returning fallback
 * @returns A function that returns boolean, with timeout-based fallback logic
 *
 * @example
 * const canLoad = returnFallbackIfPredicateFalseAfterTimeout(
 *   () => isReady,
 *   true,
 *   3000
 * );
 * // Will return true immediately if isReady is true
 * // Will return true after 3000ms if isReady never becomes true
 */
export function returnFallbackIfPredicateFalseAfterTimeout(
  predicate: () => boolean,
  fallbackReturnValue: boolean,
  timeoutMs: number
): () => boolean {
  let startTime: number | null = null;
  let hasTimedOut = false;

  return () => {
    const predicateResult = predicate();

    // If predicate is true, reset and return true
    if (predicateResult) {
      startTime = null;
      hasTimedOut = false;
      return true;
    }

    // If predicate is false, track time
    if (!startTime) {
      startTime = Date.now();
    }

    // Check if timeout has elapsed
    const elapsed = Date.now() - startTime;
    if (elapsed >= timeoutMs) {
      hasTimedOut = true;
      return fallbackReturnValue;
    }

    // Still waiting for timeout, predicate is false
    return false;
  };
}

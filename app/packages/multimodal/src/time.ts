/** Current monotonic timestamp in milliseconds, falling back to wall time when needed. */
export function monotonicNowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

/** Rounded elapsed milliseconds since a timestamp returned by `monotonicNowMs`. */
export function durationMsSince(startMs: number): number {
  return Number((monotonicNowMs() - startMs).toFixed(1));
}

/** Current monotonic timestamp in milliseconds, falling back to wall time when needed. */
export function monotonicNowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

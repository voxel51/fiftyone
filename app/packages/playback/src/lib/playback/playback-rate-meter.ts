/** A low-frequency meter for committed media time per wall-clock second. */
export interface PlaybackRateMeter {
  /** Clears the active measurement window. */
  reset(wallTimeMs?: number): void;
  /**
   * Adds committed media time for one engine tick. Returns a new measured
   * rate only when the publish interval has elapsed.
   */
  sample(wallTimeMs: number, committedMediaSeconds: number): number | null;
}

/**
 * Creates an achieved-playback-rate meter. Call `sample` on every engine
 * tick, including stalled ticks with zero committed media, so buffering is
 * reflected in the result instead of disappearing from its denominator.
 */
export function createPlaybackRateMeter(
  publishIntervalMs = 1_000,
): PlaybackRateMeter {
  const intervalMs = Math.max(1, publishIntervalMs);
  let windowStartedAtMs: number | null = null;
  let committedMediaSeconds = 0;

  return {
    reset(wallTimeMs) {
      windowStartedAtMs = wallTimeMs ?? null;
      committedMediaSeconds = 0;
    },
    sample(wallTimeMs, mediaSeconds) {
      if (windowStartedAtMs === null || wallTimeMs < windowStartedAtMs) {
        windowStartedAtMs = wallTimeMs;
        committedMediaSeconds = 0;
        // There is no valid wall interval for this sample. In particular, do
        // not carry a media delta observed across a clock rollback into the
        // fresh window.
        return null;
      }
      committedMediaSeconds += Math.max(0, mediaSeconds);
      const elapsedMs = wallTimeMs - windowStartedAtMs;
      if (elapsedMs < intervalMs) return null;

      const rate = (committedMediaSeconds / Math.max(1, elapsedMs)) * 1_000;
      windowStartedAtMs = wallTimeMs;
      committedMediaSeconds = 0;
      return rate;
    },
  };
}

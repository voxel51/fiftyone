/** Maximum presentation rate shared by lightweight episode grid previews. */
export const EPISODE_PREVIEW_MAX_FPS = 12;

const NANOSECONDS_PER_MILLISECOND = 1_000_000;
const MIN_FRAME_DELAY_MS = 1_000 / EPISODE_PREVIEW_MAX_FPS;
const SCHEDULER_EPSILON_MS = 1e-6;

/**
 * Stateful 1x timeline scheduler for a pull-based preview stream.
 *
 * Frames normally occupy consecutive 12fps wall-clock slots. When that would
 * leave playback at least one whole slot behind source time, the stale input
 * is skipped and the next source frame reuses the slot. This distributes
 * drops across a faster source instead of rejecting every sub-83ms interval.
 */
export class EpisodePreviewPlaybackScheduler {
  private anchorSourceTimeNs: bigint | undefined;
  private anchorWallTimeMs: number | undefined;
  private lastPresentedAtMs: number | undefined;

  reset(frameTimeNs: bigint | undefined, presentedAtMs: number): void {
    this.anchorSourceTimeNs = frameTimeNs;
    this.anchorWallTimeMs =
      frameTimeNs === undefined ? undefined : presentedAtMs;
    this.lastPresentedAtMs =
      frameTimeNs === undefined ? undefined : presentedAtMs;
  }

  /** Returns a delay for a presentation slot, or null when this input is stale. */
  nextDelayMs(
    frameTimeNs: bigint | undefined,
    nowMs: number,
    force = false,
  ): number | null {
    if (
      frameTimeNs === undefined ||
      this.anchorSourceTimeNs === undefined ||
      this.anchorWallTimeMs === undefined ||
      this.lastPresentedAtMs === undefined
    ) {
      return this.lastPresentedAtMs === undefined
        ? 0
        : Math.max(0, this.lastPresentedAtMs + MIN_FRAME_DELAY_MS - nowMs);
    }

    const sourceDueAtMs =
      this.anchorWallTimeMs +
      Number(frameTimeNs - this.anchorSourceTimeNs) /
        NANOSECONDS_PER_MILLISECOND;
    const targetAtMs = Math.max(
      sourceDueAtMs,
      this.lastPresentedAtMs + MIN_FRAME_DELAY_MS,
      nowMs,
    );
    if (
      !force &&
      targetAtMs - sourceDueAtMs >= MIN_FRAME_DELAY_MS - SCHEDULER_EPSILON_MS
    ) {
      return null;
    }

    return Math.max(0, targetAtMs - nowMs);
  }

  /** Commits the actual wall time after the scheduled delay settles. */
  markPresented(frameTimeNs: bigint | undefined, presentedAtMs: number): void {
    if (
      frameTimeNs !== undefined &&
      (this.anchorSourceTimeNs === undefined ||
        this.anchorWallTimeMs === undefined)
    ) {
      this.anchorSourceTimeNs = frameTimeNs;
      this.anchorWallTimeMs = presentedAtMs;
    }
    this.lastPresentedAtMs = presentedAtMs;
  }
}

/**
 * Returns a one-step wall-clock delay before presenting a preview frame.
 * Sequence playback must use {@link EpisodePreviewPlaybackScheduler} so
 * sub-cap source intervals accumulate phase and distribute skips fairly.
 */
export function episodePreviewPlaybackDelayMs(
  previousFrameTimeNs: bigint | undefined,
  frameTimeNs: bigint | undefined,
  elapsedMs = 0,
): number {
  const timelineDelayMs =
    previousFrameTimeNs !== undefined &&
    frameTimeNs !== undefined &&
    frameTimeNs > previousFrameTimeNs
      ? Number(frameTimeNs - previousFrameTimeNs) / NANOSECONDS_PER_MILLISECOND
      : 0;

  return Math.max(0, Math.max(MIN_FRAME_DELAY_MS, timelineDelayMs) - elapsedMs);
}

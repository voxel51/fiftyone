/** Maximum presentation rate shared by lightweight episode grid previews. */
export const EPISODE_PREVIEW_MAX_FPS = 12;

const NANOSECONDS_PER_MILLISECOND = 1_000_000;
const MIN_FRAME_DELAY_MS = 1_000 / EPISODE_PREVIEW_MAX_FPS;

/**
 * Returns the wall-clock delay before presenting a preview frame. A `null`
 * result means the frame should be skipped to preserve one-times playback.
 */
export function episodePreviewPlaybackDelayMs(
  previousFrameTimeNs: bigint | undefined,
  frameTimeNs: bigint | undefined,
  elapsedMs = 0,
): number | null {
  const timelineDelayMs =
    previousFrameTimeNs !== undefined &&
    frameTimeNs !== undefined &&
    frameTimeNs > previousFrameTimeNs
      ? Number(frameTimeNs - previousFrameTimeNs) / NANOSECONDS_PER_MILLISECOND
      : 0;

  if (timelineDelayMs > 0 && timelineDelayMs < MIN_FRAME_DELAY_MS) {
    return null;
  }

  return Math.max(0, Math.max(MIN_FRAME_DELAY_MS, timelineDelayMs) - elapsedMs);
}

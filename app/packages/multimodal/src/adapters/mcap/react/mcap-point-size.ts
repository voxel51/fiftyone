/** Default point sprite size for MCAP point-cloud rendering. */
export const DEFAULT_MCAP_POINT_CLOUD_POINT_SIZE = 2;

/** Smallest user-selectable MCAP point sprite size. */
export const MIN_MCAP_POINT_CLOUD_POINT_SIZE = 1;

/** Largest user-selectable MCAP point sprite size. */
export const MAX_MCAP_POINT_CLOUD_POINT_SIZE = 10;

/** Increment used by point-size settings controls. */
export const MCAP_POINT_CLOUD_POINT_SIZE_STEP = 0.25;

/** Default projected-dot size over camera imagery. */
export const DEFAULT_MCAP_PROJECTION_POINT_SIZE =
  3 * DEFAULT_MCAP_POINT_CLOUD_POINT_SIZE;

/** Clamps a finite MCAP point size or returns the caller-provided fallback. */
export function normalizeMcapPointSize(
  value: unknown,
  fallback = DEFAULT_MCAP_POINT_CLOUD_POINT_SIZE,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(
    MAX_MCAP_POINT_CLOUD_POINT_SIZE,
    Math.max(MIN_MCAP_POINT_CLOUD_POINT_SIZE, value),
  );
}

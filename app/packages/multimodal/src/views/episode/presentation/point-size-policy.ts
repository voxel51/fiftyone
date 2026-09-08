/** Default point sprite size for episode point-cloud rendering. */
export const DEFAULT_POINT_CLOUD_POINT_SIZE = 2;

/** Smallest user-selectable episode point sprite size. */
export const MIN_POINT_CLOUD_POINT_SIZE = 1;

/** Largest user-selectable episode point sprite size. */
export const MAX_POINT_CLOUD_POINT_SIZE = 10;

/** Increment used by point-size settings controls. */
export const POINT_CLOUD_POINT_SIZE_STEP = 0.25;

/** Default projected-dot size over camera imagery. */
export const DEFAULT_PROJECTION_POINT_SIZE = 3 * DEFAULT_POINT_CLOUD_POINT_SIZE;

/** Clamps a finite episode point size or returns the caller-provided fallback. */
export function normalizePointSize(
  value: unknown,
  fallback = DEFAULT_POINT_CLOUD_POINT_SIZE,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(
    MAX_POINT_CLOUD_POINT_SIZE,
    Math.max(MIN_POINT_CLOUD_POINT_SIZE, value),
  );
}

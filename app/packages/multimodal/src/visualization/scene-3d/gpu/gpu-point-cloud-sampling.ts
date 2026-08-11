/**
 * Number of canonical decoder samples a consumer should draw for its local
 * budget. A non-positive budget retains one point, matching the CPU path.
 */
export function gpuPointCloudDrawCount(
  sampledPointCount: number,
  maxRenderedPoints: number,
): number {
  const sampled = normalizedCount(sampledPointCount);
  if (sampled === 0) {
    return 0;
  }
  const budget =
    maxRenderedPoints === Number.POSITIVE_INFINITY
      ? sampled
      : Number.isFinite(maxRenderedPoints)
        ? Math.max(1, Math.floor(maxRenderedPoints))
        : 1;
  return Math.min(sampled, budget);
}

/**
 * Maps one consumer draw index into the canonical payload's stable prefix.
 * The worker orders samples progressively, so reducing a local draw budget
 * does not replace points that were already visible at a smaller budget.
 */
export function gpuPointCloudSampleIndex(
  sampledPointCount: number,
  drawnPointCount: number,
  renderedIndex: number,
): number | null {
  const sampled = normalizedCount(sampledPointCount);
  const drawn = normalizedCount(drawnPointCount);
  if (
    sampled === 0 ||
    drawn === 0 ||
    drawn > sampled ||
    !Number.isInteger(renderedIndex) ||
    renderedIndex < 0 ||
    renderedIndex >= drawn
  ) {
    return null;
  }
  return renderedIndex;
}

function normalizedCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

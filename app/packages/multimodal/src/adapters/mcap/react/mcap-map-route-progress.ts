import type { ResolvedLocationTrackPosition } from "./mcap-location-track";

/** Layer filters for one resolved point on a static segmented route. */
export interface McapMapRouteProgressFilters {
  readonly active: readonly unknown[];
  readonly future: readonly unknown[];
  readonly key: string;
  readonly past: readonly unknown[];
}

/** Filters static route segments without replacing their GeoJSON geometry. */
export function mcapMapRouteProgressFilters(
  resolved: ResolvedLocationTrackPosition,
): McapMapRouteProgressFilters {
  const segment = ["get", "segmentIndex"] as const;
  const activeSegment = resolved.segmentIndex;
  return {
    active: ["==", segment, activeSegment ?? -1],
    future:
      activeSegment === null
        ? [">=", segment, resolved.boundarySegmentIndex]
        : [">", segment, activeSegment],
    key: `${resolved.state}:${resolved.boundarySegmentIndex}:${activeSegment ?? -1}`,
    past: ["<", segment, activeSegment ?? resolved.boundarySegmentIndex],
  };
}

import { getEventBus } from "@fiftyone/events";
import { useEffect } from "react";

/** Where the App draws a sample's saved segments. */
export type SavedSegmentsSurface = "tile" | "timeline";

/** e2e specs wait on a surface drawing a sample's saved segments */
type SavedSegmentsE2EEvents = {
  "e2e:selection:saved-segments-shown": { surface: SavedSegmentsSurface };
};

/**
 * Tells e2e specs a surface has drawn the saved segments it loaded for a
 * sample: the grid tile's badge, or the modal timeline's ranges. Call it from
 * the component that renders them, so they are on screen when it fires.
 */
export function useSavedSegmentsShown(
  surface: SavedSegmentsSurface,
  segments: {
    readonly active: boolean;
    readonly loading: boolean;
    readonly count: number;
  },
) {
  const { active, loading, count } = segments;
  // This effect tells e2e specs the saved segments, once loaded, are drawn.
  useEffect(() => {
    if (!active || loading) return;
    getEventBus<SavedSegmentsE2EEvents>().dispatch(
      "e2e:selection:saved-segments-shown",
      { surface },
    );
  }, [surface, active, loading, count]);
}

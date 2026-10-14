import type { EventCondition } from "src/shared/event-utils";

/** Where the App draws a sample's saved segments */
type SavedSegmentsSurface = "tile" | "timeline";

/** The `surface` has drawn the saved segments of the sample it shows */
export const savedSegmentsShown = (
  surface: SavedSegmentsSurface,
): EventCondition => ({
  events: "e2e:selection:saved-segments-shown",
  predicate: (e) => (e.detail as { surface: string }).surface === surface,
});

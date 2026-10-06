import { FeatureFlag, useFeature } from "@fiftyone/feature-flags";
import * as fos from "@fiftyone/state";
import { useMemo } from "react";

// Module-level so `useGroupSlices` gets a stable argument for its memo.
const IMAGE_SLICES: ["image"] = ["image"];

/**
 * Slices the playback can show, as image streams. `[null]` for a dynamic
 * group over a dataset without slices. Only image slices play: video slices
 * have their own clock and 3D slices load whole files per element.
 */
export function usePlaybackSliceNames(): (string | null)[] {
  const hasGroupSlices = fos.useHasGroupSlices();
  const imageSlices = fos.useGroupSlices(IMAGE_SLICES);
  const parentMediaType = fos.useParentMediaType();
  return useMemo(() => {
    if (!hasGroupSlices) return parentMediaType === "image" ? [null] : [];
    return [...imageSlices].sort();
  }, [hasGroupSlices, imageSlices, parentMediaType]);
}

/**
 * Whether the "timeline" display option is offered for the current view:
 * the group timeline feature is on (`VFF_GROUP_TIMELINE`), the dynamic group
 * is ordered, and it has at least one image slice to play.
 */
export function useGroupTimelineAvailable(): boolean {
  const { isEnabled } = useFeature({ feature: FeatureFlag.GROUP_TIMELINE });
  const ordered = fos.useDynamicGroupOrderBy() !== null;
  const slices = usePlaybackSliceNames();
  return isEnabled && ordered && slices.length > 0;
}

/**
 * Whether the sample view plays the dynamic group on a timeline instead of
 * paging it: the timeline is available and chosen as the view mode, outside
 * annotate mode.
 */
export function useShowsGroupPlayback(): boolean {
  const available = useGroupTimelineAvailable();
  const dynamic = fos.useIsDynamicGroup();
  const mode = fos.useDynamicGroupsViewMode(true);
  const annotate = fos.useModalMode() === fos.ModalMode.ANNOTATE;
  return available && dynamic && mode === "timeline" && !annotate;
}

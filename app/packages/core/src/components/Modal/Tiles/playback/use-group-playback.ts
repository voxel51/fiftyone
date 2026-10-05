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
 * Whether the sample view plays the dynamic group instead of paging it: an
 * ordered dynamic group in "video" view mode with at least one image slice,
 * outside annotate mode. Otherwise the existing views (ImaVid included)
 * stay in charge.
 */
export function useShowsGroupPlayback(): boolean {
  const dynamic = fos.useIsDynamicGroup();
  const video = fos.useShouldRenderImaVidLooker(true);
  const annotate = fos.useModalMode() === fos.ModalMode.ANNOTATE;
  const slices = usePlaybackSliceNames();
  return dynamic && video && !annotate && slices.length > 0;
}

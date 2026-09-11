import {
  isFrameScopedPath,
  useActiveSampleId,
  useAnnotationEngine,
  useFrameValue,
} from "@fiftyone/annotation";
import {
  useDynamicGroupOrderBy,
  useIsImageDynamicGroupVideo,
} from "@fiftyone/state";
import type { Primitive } from "@fiftyone/utilities";

const FRAME_NUMBER_PATH = "frames.frame_number";

/** Whether a primitive path's value lives on the frame under the playhead. */
export const useIsFramePrimitive = (path: string): boolean =>
  isFrameScopedPath(path, useIsImageDynamicGroupVideo());

/** A frame-scoped primitive's value at the playhead; `undefined` until that frame has streamed. */
export const useFramePrimitiveValue = (path: string): Primitive | undefined =>
  useFrameValue(useAnnotationEngine(), useActiveSampleId(), path) as
    | Primitive
    | undefined;

/**
 * Why a frame primitive cannot be edited, or null when it can. The clip's own
 * clock never edits: `frame_number` on a video, and the field an image
 * dataset is ordered by when it plays as a dynamic group.
 */
export const framePrimitiveReadOnlyReason = (
  path: string,
  isImageDynamicGroupVideo: boolean,
  orderBy: string | null,
): string | null => {
  if (isImageDynamicGroupVideo) {
    return orderBy !== null && path === orderBy
      ? `${path} orders this dynamic group and cannot be edited`
      : null;
  }

  return path === FRAME_NUMBER_PATH
    ? "frame_number is the video's frame clock and cannot be edited"
    : null;
};

export const useFramePrimitiveReadOnlyReason = (path: string): string | null =>
  framePrimitiveReadOnlyReason(
    path,
    useIsImageDynamicGroupVideo(),
    useDynamicGroupOrderBy(),
  );

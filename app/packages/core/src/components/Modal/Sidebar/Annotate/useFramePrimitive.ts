/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  isFrameScopedPath,
  useActiveSampleId,
  useAnnotationEngine,
  useFrameValue,
  useTemporal,
} from "@fiftyone/annotation";
import {
  useDynamicGroupGroupBy,
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

/** The frame under the playhead, or `undefined` outside a temporal view. */
export const usePlayheadFrame = (): number | undefined =>
  useTemporal(useAnnotationEngine(), (reads) => reads.frame());

/**
 * Why a frame primitive cannot be edited, or null when it can. What defines
 * the clip never edits: `frame_number` on a video, and the fields an image
 * dataset is grouped and ordered by when it plays as a dynamic group.
 */
export const framePrimitiveReadOnlyReason = (
  path: string,
  isImageDynamicGroupVideo: boolean,
  orderBy: string | null,
  groupBy: string | null,
): string | null => {
  if (isImageDynamicGroupVideo) {
    if (orderBy !== null && path === orderBy) {
      return `${path} orders this dynamic group and cannot be edited`;
    }

    // editing it would move the sample into another group mid-session
    return groupBy !== null && path === groupBy
      ? `${path} groups this dynamic group and cannot be edited`
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
    useDynamicGroupGroupBy(),
  );

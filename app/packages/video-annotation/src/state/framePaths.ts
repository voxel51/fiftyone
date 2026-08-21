/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { FRAMES_PREFIX } from "@fiftyone/annotation";

/**
 * Whether `path` addresses per-frame labels, per the dual path namespace: a
 * real video's frame labels live under `frames.*` (bare paths there are
 * sample-level, e.g. temporal detections), while an image dataset dynamically
 * grouped into a video (ImaVid) has no `frames.*` namespace — each "frame" is
 * a sample, so its bare sample-level paths are the frame-scoped ones.
 */
export const isFrameScopedPath = (
  path: string,
  isImageDynamicGroupVideo: boolean,
): boolean =>
  isImageDynamicGroupVideo
    ? !path.startsWith(FRAMES_PREFIX)
    : path.startsWith(FRAMES_PREFIX);

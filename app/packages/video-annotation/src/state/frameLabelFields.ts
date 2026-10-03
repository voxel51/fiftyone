/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { LabelType } from "@fiftyone/utilities";
import { isFrameScopedPath } from "./framePaths";

/**
 * Label-schema `type` → the frame label type the annotate surface registers.
 * List fields ride as instance tracks; single-label fields ride as singletons,
 * one value per frame. A single Detection or Polyline frame field is left out:
 * its frames belong to instance tracks, which the store only holds in lists.
 */
const FRAME_LABEL_TYPE: Record<string, LabelType> = {
  classification: LabelType.Classification,
  detections: LabelType.Detections,
  polylines: LabelType.Polylines,
  regression: LabelType.Regression,
};

/**
 * The frame-scoped annotation fields the engine's frame store registers: a
 * real video's `frames.*` fields, or an image dataset grouped into a video's
 * bare sample fields.
 *
 * @param paths - Annotation-active label paths.
 * @param schemaTypeOf - A path's label-schema `type` (e.g. `"detections"`).
 */
export const toFrameLabelFields = (
  paths: readonly string[],
  schemaTypeOf: (path: string) => string | undefined,
  isImageDynamicGroupVideo: boolean,
): Record<string, LabelType> => {
  const fields: Record<string, LabelType> = {};

  for (const path of paths) {
    const type = FRAME_LABEL_TYPE[schemaTypeOf(path)?.toLowerCase() ?? ""];

    if (type && isFrameScopedPath(path, isImageDynamicGroupVideo)) {
      fields[path] = type;
    }
  }

  return fields;
};

import {
  type AnnotationEngine,
  isFrameScopedPath,
  singletonAddressId,
} from "@fiftyone/annotation";
import { useIsImageDynamicGroupVideo } from "@fiftyone/state";
import { isSingletonLabelType } from "@fiftyone/utilities";
import { useCallback } from "react";
import type { FrameSingletonSlot } from "./types";

/**
 * Where a new single-label value lands on a video: the playhead frame of a
 * frame-scoped singleton field, addressed by the field. `undefined` for a
 * sample-level field or a non-temporal engine.
 */
export const useFrameSingletonSlot = (
  engine: AnnotationEngine,
): ((path: string) => FrameSingletonSlot | undefined) => {
  const isImageDynamicGroupVideo = useIsImageDynamicGroupVideo();

  return useCallback(
    (path) => {
      const frame = engine.temporal?.frame();

      if (
        frame == null ||
        !isFrameScopedPath(path, isImageDynamicGroupVideo) ||
        !isSingletonLabelType(engine.getLabelType(path))
      ) {
        return undefined;
      }

      return { instanceId: singletonAddressId(path), frame };
    },
    [engine, isImageDynamicGroupVideo],
  );
};

/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useAnnotationEngine } from "@fiftyone/annotation";
import { useEffect } from "react";
import { useCurrentFrame } from "./useCurrentFrame";

/**
 * Re-stamp a frame-label anchor to the same track at the new playhead frame,
 * so the form follows the instance across frames. A gap or a sample-level
 * anchor leaves the anchor alone.
 */
export const useFollowAnchorFrame = (): void => {
  const engine = useAnnotationEngine();
  const frame = useCurrentFrame();

  useEffect(() => {
    const anchor = engine.interaction.getAnchor();

    if (!anchor || anchor.frame == null || anchor.frame === frame) {
      return;
    }

    const next = { ...anchor, frame };

    // track absent on this frame — keep editing the current occurrence
    if (!engine.getLabel(next)) {
      return;
    }

    engine.interaction.setActive([next]);
  }, [engine, frame]);
};

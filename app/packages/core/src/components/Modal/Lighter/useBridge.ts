/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type { Scene2D } from "@fiftyone/lighter";
import { useEffect } from "react";
import useColorMappingContext from "./useColorMappingContext";
import { useLighterTooltipEventHandler } from "./useLighterTooltipEventHandler";
import { useOverlayPersistence } from "./useOverlayPersistence";

/**
 * Hook that bridges FiftyOne state management system with Lighter.
 *
 * This is two-way:
 * 1. We listen to certain events from "FiftyOne state" world and react to them, or
 * 2. We trigger certain events into "FiftyOne state" world based on user interactions in Lighter.
 */
export const useBridge = (scene: Scene2D | null) => {
  useLighterTooltipEventHandler(scene);
  useOverlayPersistence(scene);
  const context = useColorMappingContext();

  // Effect to update scene with color scheme changes
  useEffect(() => {
    if (!scene) {
      return;
    }

    // Update the scene's color mapping context
    scene.updateColorMappingContext(context);

    // Mark all overlays as dirty to trigger re-rendering with new colors
    for (const overlay of scene.getAllOverlays()) {
      overlay.markDirty();
    }
  }, [scene, context]);
};

/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { Scene2D } from "@fiftyone/lighter";
import { colorScheme, colorSeed } from "@fiftyone/state";
import { useEffect } from "react";
import { useRecoilValue } from "recoil";
import { useLighterOverlayPersistence } from "./useLighterOverlayPersistence";
import { useLighterTooltipEventHandler } from "./useLighterTooltipEventHandler";

/**
 * Hook that bridges FiftyOne state management system with Lighter.
 *
 * This is two-way:
 * 1. We listen to certain events from "FiftyOne state" world and react to them, or
 * 2. We trigger certain events into "FiftyOne state" world based on user interactions in Lighter.
 */
export const useBridge = (scene: Scene2D | null) => {
  const currentColorScheme = useRecoilValue(colorScheme);
  const currentColorSeed = useRecoilValue(colorSeed);

  useLighterTooltipEventHandler(scene);

  // Effect to update scene with color scheme changes
  useEffect(() => {
    if (!scene) {
      return;
    }

    // Update the scene's color mapping context
    scene.updateColorMappingContext({
      colorScheme: currentColorScheme,
      seed: currentColorSeed,
    });

    // Mark all overlays as dirty to trigger re-rendering with new colors
    scene.getAllOverlays().forEach((overlay) => {
      overlay.markDirty();
    });
  }, [scene, currentColorScheme, currentColorSeed]);
};

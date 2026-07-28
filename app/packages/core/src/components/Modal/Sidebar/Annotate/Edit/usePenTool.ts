/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

// Pen-tool lifecycle: installs an InteractivePenHandler on the selected
// detection while the pen tool is active, and tears it down on tool/mode/
// selection change. Modeled on `usePolylineMode`'s install/exit shape.

import { useEffect, useRef } from "react";

import type { Scene2D } from "@fiftyone/lighter";
import { DetectionOverlay, InteractivePenHandler } from "@fiftyone/lighter";
import type { AnnotationLabel } from "@fiftyone/state";

import { SegmentationTool } from "./useManualSegmentationTools";

export interface UsePenToolArgs {
  /** The active Scene2D, or undefined while uninitialized. */
  scene: Scene2D | undefined;
  /** Whether segmentation mode is currently active. */
  segmentationModeActive: boolean;
  /** The active segmentation tool from `useManualSegmentationTools`. */
  tool: SegmentationTool;
  /** The overlay of the currently-selected annotation label, if any. */
  selectedOverlay: AnnotationLabel["overlay"] | undefined;
}

/**
 * Installs an {@link InteractivePenHandler} on `selectedOverlay` whenever the
 * pen tool is the active gesture (`tool === Pen` + segmentation mode active
 * + a `DetectionOverlay` is selected). Exits the handler on any condition
 * change, and on unmount.
 *
 * No-op when the pen tool isn't active or there's no detection selected —
 * the legacy first-click create path handles overlay creation, after which
 * selection lands on the new overlay and this effect re-runs to install the
 * handler for subsequent clicks.
 */
export const usePenTool = ({
  scene,
  segmentationModeActive,
  tool,
  selectedOverlay,
}: UsePenToolArgs): void => {
  const installedHandlerRef = useRef<InteractivePenHandler | null>(null);

  // Keep a stable reference to `scene` for the unmount-cleanup effect so it
  // doesn't capture a stale value across re-renders.
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  useEffect(() => {
    const exit = () => {
      const installed = installedHandlerRef.current;
      if (!installed) return;
      installed.cleanup();
      sceneRef.current?.exitInteractiveMode();
      installedHandlerRef.current = null;
    };

    if (!scene || !segmentationModeActive) {
      exit();
      return;
    }

    if (tool !== SegmentationTool.Pen) {
      exit();
      return;
    }

    if (!(selectedOverlay instanceof DetectionOverlay)) {
      exit();
      return;
    }

    const installed = installedHandlerRef.current;
    if (installed && installed.overlay === selectedOverlay) {
      return;
    }

    exit();

    // The legacy first-click create path leaves the scene in interactive mode
    // wrapping an InteractiveDetectionHandler that's already been removed
    // from the handler list. `enterInteractiveMode` is a no-op in that state,
    // so flip it off before re-entering with the pen handler.
    scene.exitInteractiveMode();

    const handler = new InteractivePenHandler(selectedOverlay);
    scene.enterInteractiveMode(handler);
    installedHandlerRef.current = handler;
  }, [scene, segmentationModeActive, tool, selectedOverlay]);

  // Tear down on unmount.
  useEffect(() => {
    return () => {
      const installed = installedHandlerRef.current;
      if (!installed) return;
      installed.cleanup();
      sceneRef.current?.exitInteractiveMode();
      installedHandlerRef.current = null;
    };
  }, []);
};

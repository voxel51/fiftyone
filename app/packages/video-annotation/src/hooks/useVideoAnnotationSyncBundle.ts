/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useLighterSetupWithPixi } from "@fiftyone/lighter";
import type { RefObject } from "react";
import { useSyncLighterAnnotation } from "../sync/useSyncLighterAnnotation";
import { useSyncMediaTransform } from "../sync/useSyncMediaTransform";
import { useTemporalOverlaySync } from "../sync/useTemporalOverlaySync";

type TileScene = ReturnType<typeof useLighterSetupWithPixi>["scene"];

/**
 * The overlay / sync hooks both lighter tiles wire up, in their order-sensitive
 * order.
 *
 * Frame detections render through the engine's frame-locked Lighter bridge
 * (mounted by `useVideoLighterEngineBridge`); TD canvas chips are engine-sourced
 * and sidebar membership is engine-derived (`useEntries`). What remains here:
 * the TD overlay sync, the draw-mode / mode-quit event bridges, and media
 * transform tracking.
 *
 * `mediaRef` is the element the media transform tracks so scroll-zoom scales
 * the picture, not just the overlays — the `<video>` for the native tile, the
 * frame `<canvas>` for imavid.
 */
export function useVideoAnnotationSyncBundle<T extends HTMLElement>({
  scene,
  canonicalMediaReady,
  mediaRef,
}: {
  scene: TileScene;
  canonicalMediaReady: boolean;
  mediaRef: RefObject<T | null>;
}): void {
  useTemporalOverlaySync(scene, canonicalMediaReady);
  useSyncLighterAnnotation(scene);
  useSyncMediaTransform(scene, mediaRef);
}

/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useLighterSetupWithPixi } from "@fiftyone/lighter";
import type { RefObject } from "react";
import { useExposeSceneOverlayFieldsForTest } from "../sync/useExposeSceneOverlayFieldsForTest";
import { useSyncMediaTransform } from "../sync/useSyncMediaTransform";
import { useTemporalOverlaySync } from "../sync/useTemporalOverlaySync";

type TileScene = ReturnType<typeof useLighterSetupWithPixi>["scene"];

/**
 * The read-only half of {@link useVideoAnnotationSyncBundle}: overlays are
 * pushed into the scene and the media tracks the viewport, but nothing
 * installs an editing path.
 *
 * Explore deliberately omits `useSyncLighterAnnotation`. That hook reaches
 * into the Annotate sidebar's edit machinery (`useAnnotationContext`,
 * `useDetectionMode`, `useSegmentationMode`, `useExit`) and installs the
 * draw / create / mode-quit handlers on the scene — mounting it here would
 * arm annotation editing on a surface that has no way to save.
 */
export function useVideoExploreSyncBundle<T extends HTMLElement>({
  scene,
  canonicalMediaReady,
  mediaRef,
}: {
  scene: TileScene;
  canonicalMediaReady: boolean;
  mediaRef: RefObject<T | null>;
}): void {
  useTemporalOverlaySync(scene, canonicalMediaReady);
  useSyncMediaTransform(scene, mediaRef);
  useExposeSceneOverlayFieldsForTest(scene);
}

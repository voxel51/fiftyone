/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { useLighterSetupWithPixi } from "@fiftyone/lighter";
import { type RefObject, useEffect, useState } from "react";
import { singletonCanvas } from "../../../core/src/components/Modal/Lighter/SharedCanvas";
import { ExternalCanonicalMedia } from "../media/ExternalCanonicalMedia";
import { useColorScheme, useColorSeed } from "../state/accessors";

/** Intrinsic media resolution the canonical-media overlay is sized to. */
export interface Dimensions {
  w: number;
  h: number;
}

export type LighterScene = ReturnType<typeof useLighterSetupWithPixi>["scene"];

/**
 * Attach the SINGLETON Lighter canvas into `hostRef`. One
 * SharedPixiApplication per page binds to the first canvas it sees; a fresh
 * canvas would leave Pixi rendering to the old (image-modal) one.
 */
export function useAttachedSingletonCanvas(
  hostRef: RefObject<HTMLDivElement | null>,
): HTMLCanvasElement | null {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return undefined;
    }

    setCanvas(singletonCanvas.getCanvas(host));

    return () => {
      singletonCanvas.detach();
    };
  }, [hostRef]);

  return canvas;
}

/** Keep the scene's color mapping in sync with the FiftyOne color scheme. */
export function useSceneColorScheme(
  scene: LighterScene,
  sceneId: string,
): void {
  const scheme = useColorScheme();
  const seed = useColorSeed();

  useEffect(() => {
    if (!scene || scene.getSceneId() !== sceneId) {
      return;
    }

    scene.updateColorMappingContext({ colorScheme: scheme, seed });
  }, [scene, sceneId, scheme, seed]);
}

/**
 * Apply the per-scene interaction flags; a re-minted scene starts out
 * writable and single-select, so both are re-applied per scene id.
 */
export function useSceneInteractionFlags(
  scene: LighterScene,
  sceneId: string,
  flags: { readOnly: boolean; multipleSelection: boolean },
): void {
  const { readOnly, multipleSelection } = flags;

  useEffect(() => {
    if (!scene || scene.getSceneId() !== sceneId) {
      return;
    }
    scene.setReadOnly(readOnly);
  }, [scene, sceneId, readOnly]);

  useEffect(() => {
    if (!scene || scene.getSceneId() !== sceneId) {
      return;
    }
    scene.setMultipleSelection(multipleSelection);
  }, [scene, sceneId, multipleSelection]);
}

/**
 * Install a no-pixel canonical-media overlay sized to `dims`. Returns whether
 * the current scene's media is installed; overlays added before it exists have
 * no coordinate context.
 */
export function useCanonicalMediaInstall(
  scene: LighterScene,
  sceneId: string,
  dims: Dimensions | null,
): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
  }, [sceneId]);

  useEffect(() => {
    if (!scene || !dims) {
      return;
    }

    if (scene.getSceneId() !== sceneId) {
      return;
    }

    const media = new ExternalCanonicalMedia({
      width: dims.w,
      height: dims.h,
    });

    scene.addOverlay(media);
    scene.setCanonicalMedia(media);
    setReady(true);
  }, [scene, sceneId, dims]);

  return ready;
}

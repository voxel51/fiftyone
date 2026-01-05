/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useLookerOptions } from "@fiftyone/state";
import { useAtom } from "jotai";
import { useEffect, useRef } from "react";
import {
  PixiRenderer2D,
  Scene2D,
  globalPixiResourceLoader,
  lighterSceneAtom,
  useLighterEventBus,
} from "../index";

// TODO: Ultimately, we'll want to remove dependency on "looker" and create our own options type
// This type extends what fos.useLookerOptions returns to maintain compatibility during transition
export type LighterOptions = Partial<ReturnType<typeof useLookerOptions>>;

/**
 * Hook for setting up the Lighter library in React components.
 * This hook handles initialization and stores the scene instance in global state.
 *
 * All effects related to lighter should be handled in this hook.
 *
 * @param stableCanvas - The canvas element to use for rendering. This should be a stable reference,
 * i.e., it should not change during the lifetime of the component.
 * @param options - The options for the scene.
 */
export const useLighterSetupWithPixi = (
  stableCanvas: HTMLCanvasElement,
  options: LighterOptions,
  sceneId: string
) => {
  const [scene, setScene] = useAtom(lighterSceneAtom);
  const eventBus = useLighterEventBus(sceneId);

  const rendererRef = useRef<PixiRenderer2D | null>(null);

  useEffect(() => {
    if (!stableCanvas || !sceneId) return;

    const renderer = new PixiRenderer2D(stableCanvas, sceneId);
    rendererRef.current = renderer;

    // Extract only the options we need for Scene2D
    const sceneOptions = {
      activePaths: options.activePaths,
      showOverlays: options.showOverlays,
      alpha: options.alpha,
    };

    const newScene = new Scene2D({
      renderer,
      canvas: stableCanvas,
      resourceLoader: globalPixiResourceLoader,
      options: sceneOptions,
      sceneId,
    });
    setScene(newScene);

    // note: do NOT add options as a dep here, we have another effect to sync scene with new options
  }, [sceneId, stableCanvas]);

  useEffect(() => {
    if (!scene || scene.isDestroyed) return;

    rendererRef.current?.initializePixiJS().then(() => {
      scene.startRenderLoop();
    });

    return () => {
      scene.destroy();
    };
  }, [scene]);

  useEffect(() => {
    if (scene && !scene.isDestroyed) {
      eventBus.dispatch("lighter:scene-options-changed", {
        activePaths: options.activePaths,
        showOverlays: options.showOverlays,
        alpha: options.alpha,
      });
    }
  }, [scene, options, eventBus]);

  return { scene };
};

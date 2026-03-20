/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { ViewportState } from "@fiftyone/looker";
import { useLookerOptions } from "@fiftyone/state";
import { useAtom } from "jotai";
import { useEffect, useRef } from "react";
import { DEFAULT_ZOOM_PAD } from "../constants";
import {
  PixiRenderer2D,
  Rect,
  Scene2D,
  globalPixiResourceLoader,
  lighterSceneAtom,
  useLighterEventBus,
  UNDEFINED_LIGHTER_SCENE_ID,
} from "../index";

// TODO: Ultimately, we'll want to remove dependency on "looker" and create our own options type
// This type extends what fos.useLookerOptions returns to maintain compatibility during transition
export type LighterOptions = Partial<ReturnType<typeof useLookerOptions>> & {
  // Auto-zoom to spatial overlay content on the first eligible render tick.
  zoom?: boolean;
  // Padding applied when auto-zooming to content.
  zoomPad?: number;
  // Pre-computed zoom target in normalized [0,1] coordinates. When provided
  // alongside zoom: true, the viewport snaps to this rect as soon as the image
  // loads, without waiting for overlay objects to be added to the scene.
  zoomTarget?: Rect | null;
  // Saved zoom/pan state to restore before the first render frame.
  initialViewport?: ViewportState | null;
};

/**
 * Hook for setting up the Lighter library in React components.
 * This hook handles initialization and stores the scene instance in global state.
 *
 * All effects related to lighter should be handled in this hook.
 *
 * @param stableCanvas - The canvas element to use for rendering. This should be a stable reference,
 * i.e., it should not change during the lifetime of the component.
 * @param options - The options for the scene.
 * @param sceneId - A unique scene ID
 */
export const useLighterSetupWithPixi = (
  stableCanvas: HTMLCanvasElement,
  options: LighterOptions,
  sceneId: string,
) => {
  const [scene, setScene] = useAtom(lighterSceneAtom);

  // Frozen at mount time — modalViewportState only changes on Looker/Lighter unmount 
  // so this value is stable for the entire lifetime of the component.
  const initialViewportRef = useRef(options.initialViewport);
  const rendererRef = useRef<PixiRenderer2D | null>(null);

  const eventChannel = scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID;
  const eventBus = useLighterEventBus(eventChannel);


  useEffect(() => {
    if (!stableCanvas || !sceneId) return;

    const renderer = new PixiRenderer2D(stableCanvas);
    rendererRef.current = renderer;

    const sceneOptions = {
      activePaths: options.activePaths,
      showOverlays: options.showOverlays,
      alpha: options.alpha,
      zoom: options.zoom,
      zoomPad: options.zoomPad ?? DEFAULT_ZOOM_PAD,
      zoomTarget: options.zoomTarget ?? undefined,
    };

    const newScene = new Scene2D({
      renderer,
      canvas: stableCanvas,
      resourceLoader: globalPixiResourceLoader,
      options: sceneOptions,
      sceneId,
    });
    setScene(newScene);

    renderer.setEventChannel(newScene.getEventChannel());

    // note: do NOT add options as a dep here, we have another effect to sync scene with new options
  }, [sceneId, stableCanvas]);

  useEffect(() => {
    if (!scene || scene.isDestroyed) return;

    rendererRef.current?.initializePixiJS().then(() => {
      if (initialViewportRef.current) {
        scene.setViewportState(initialViewportRef.current);
      }
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

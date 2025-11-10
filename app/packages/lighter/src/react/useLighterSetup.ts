/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { useLookerOptions } from "@fiftyone/state";
import { useAtom } from "jotai";
import { useEffect, useRef } from "react";
import {
  EventBus,
  LIGHTER_EVENTS,
  PixiRenderer2D,
  Scene2D,
  defaultLighterSceneAtom,
  globalPixiResourceLoader,
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
 * @param atom - The atom in which the scene is stored.
 */
export const useLighterSetupWithPixi = (
  stableCanvas: HTMLCanvasElement,
  options: LighterOptions,
  atom = defaultLighterSceneAtom
) => {
  const [scene, setScene] = useAtom(atom);

  const rendererRef = useRef<PixiRenderer2D | null>(null);
  const eventBusRef = useRef<EventBus | null>(null);

  useEffect(() => {
    if (!stableCanvas) return;

    const eventBus = new EventBus();
    eventBusRef.current = eventBus;

    const renderer = new PixiRenderer2D(stableCanvas, eventBus);
    rendererRef.current = renderer;

    // Extract only the options we need for Scene2D
    const sceneOptions = {
      activePaths: options.activePaths,
      showOverlays: options.showOverlays,
      alpha: options.alpha,
    };

    const newScene = new Scene2D({
      renderer,
      eventBus: eventBusRef.current,
      canvas: stableCanvas,
      resourceLoader: globalPixiResourceLoader,
      options: sceneOptions,
    });
    setScene(newScene);

    // note: do NOT add options as a dep here, we have another effect to sync scene with new options
  }, [stableCanvas]);

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
      scene.dispatch_DANGEROUSLY({
        type: LIGHTER_EVENTS.SCENE_OPTIONS_CHANGED,
        detail: {
          activePaths: options.activePaths,
          showOverlays: options.showOverlays,
          alpha: options.alpha,
        },
      });
    }
  }, [scene, options]);

  return { scene };
};

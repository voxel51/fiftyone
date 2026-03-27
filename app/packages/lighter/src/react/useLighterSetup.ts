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
  UNDEFINED_LIGHTER_SCENE_ID,
} from "../index";

// TODO: Ultimately, we'll want to remove dependency on "looker" and create our own options type
// This type extends what fos.useLookerOptions returns to maintain compatibility during transition
export type LighterOptions = Partial<ReturnType<typeof useLookerOptions>> & {
  /**
   * Called once after PixiJS initialization completes, before the first render
   * frame. Use this to apply one-time viewport setup such as restoring a saved
   * viewport state or queuing a content-aware initial zoom.
   *
   * Example:
   *   onInitialized: (scene) => {
   *     if (savedViewport) scene.setViewportState(savedViewport);
   *     else if (zoomTarget) scene.queueInitialZoom(zoomTarget, pad);
   *   }
   */
  onInitialized?: (scene: Scene2D) => void;
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
  sceneId: string
) => {
  const [scene, setScene] = useAtom(lighterSceneAtom);

  // Freeze the callback at mount time so we never re-run initialization if the
  // parent re-renders with a new function reference.
  const onInitializedRef = useRef(options.onInitialized);

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
      if (onInitializedRef.current) {
        onInitializedRef.current(scene);
      }
      scene.startRenderLoop();
      stableCanvas.setAttribute("lighter-ready", "true");
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

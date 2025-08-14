/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { useLookerOptions } from "@fiftyone/state";
import { useAtom } from "jotai";
import { useEffect } from "react";
import {
  EventBus,
  globalPixiResourceLoader,
  LIGHTER_EVENTS,
  PixiRenderer2D,
  Scene2D,
} from "../index";
import { lighterSceneAtom } from "../state";
import { useBridge } from "./useBridge";

// TODO: Ultimately, we'll want to remove dependency on "looker" and create our own options type
// This type extends what fos.useLookerOptions returns to maintain compatibility during transition
export type LighterOptions = Partial<ReturnType<typeof useLookerOptions>>;

/**
 * Hook for setting up the Lighter library in React components.
 * This hook handles initialization and stores the scene instance in global state.
 *
 * All effects related to lighter should be handled in this hook.
 */
export const useLighterSetup = (
  canvasRef: React.RefObject<HTMLCanvasElement>,
  options: LighterOptions
) => {
  const [scene, setScene] = useAtom(lighterSceneAtom);

  // this is the bridge between FiftyOne state management system and Lighter
  useBridge(scene);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;

    const eventBus = new EventBus();

    const rendererInstance = new PixiRenderer2D(canvas, eventBus);

    const resourceLoaderInstance = globalPixiResourceLoader;

    // Extract only the options we need for Scene2D
    const sceneOptions = {
      activePaths: options.activePaths,
      showOverlays: options.showOverlays,
      alpha: options.alpha,
    };

    const sceneInstance = new Scene2D({
      canvas,
      renderer: rendererInstance,
      resourceLoader: resourceLoaderInstance,
      eventBus,
      options: sceneOptions,
    });

    (async () => {
      // Initialize renderer if it's a PixiRenderer2D and not already initialized
      if (!rendererInstance.isReady()) {
        await rendererInstance.initializePixiJS();
      }

      await sceneInstance.startRenderLoop();

      // Store the scene instance in global state
      setScene(sceneInstance);
    })();

    return () => {
      sceneInstance.destroy();
      setScene(null);

      if ("gl" in rendererInstance.getPixiApp().renderer) {
        // note: this destroys webgl context. right now we're creating a new one per sample...
        // might want to consider using a global pixi renderer. the cost of doing that is that we have to manage lifecycle really well.
        // https://pixijs.com/8.x/guides/concepts/architecture
        rendererInstance.getPixiApp().destroy(true);
      }
    };
  }, [canvasRef, setScene]);

  useEffect(() => {
    if (scene) {
      scene.dispatch({
        type: LIGHTER_EVENTS.SCENE_OPTIONS_CHANGED,
        detail: {
          activePaths: options.activePaths,
          showOverlays: options.showOverlays,
          alpha: options.alpha,
        },
      });
    }
  }, [scene, options]);

  // Return empty object since this hook is just for setup
  // The actual scene access is provided by useLighter hook
  return {};
};

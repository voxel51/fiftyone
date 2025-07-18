/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { useLookerOptions } from "@fiftyone/state";
import { useCallback, useEffect, useState } from "react";
import {
  BaseOverlay,
  EventBus,
  globalPixiResourceLoader,
  LIGHTER_EVENTS,
  overlayFactory,
  OverlayFactory,
  PixiRenderer2D,
  Scene2D,
} from "../index";

// TODO: Ultimately, we'll want to remove dependency on "looker" and create our own options type
// This type extends what fos.useLookerOptions returns to maintain compatibility during transition
export type LighterOptions = Partial<ReturnType<typeof useLookerOptions>>;

/**
 * Hook for using the Lighter library in React components.
 */
export const useLighterWithPixi = (
  canvasRef: React.RefObject<HTMLCanvasElement>,
  options: LighterOptions,
  overlayFactoryInstance?: OverlayFactory
) => {
  const [scene, setScene] = useState<Scene2D | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [overlayCount, setOverlayCount] = useState(0);

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

    eventBus.on("overlay-added", (event) => {
      setOverlayCount((prev) => prev + 1);
    });

    (async () => {
      // Initialize renderer if it's a PixiRenderer2D and not already initialized
      if (!rendererInstance.isReady()) {
        await rendererInstance.initializePixiJS();
      }

      await sceneInstance.startRenderLoop();
      setScene(sceneInstance);
      setIsReady(true);
    })();

    return () => {
      sceneInstance.destroy();
      setScene(null);
      setIsReady(false);

      if ("gl" in rendererInstance.getPixiApp().renderer) {
        // note: this destroys webgl context. right now we're creating a new one per sample...
        // might want to consider using a global pixi renderer. the cost of doing that is that we have to manage lifecycle really well.
        // https://pixijs.com/8.x/guides/concepts/architecture
        rendererInstance.getPixiApp().destroy(true);
      }
    };
  }, [canvasRef]);

  // Update scene options when they change
  useEffect(() => {
    if (scene && options) {
      const sceneOptions = {
        activePaths: options.activePaths,
        showOverlays: options.showOverlays,
        alpha: options.alpha,
      };

      // Emit event to trigger re-rendering pipeline
      scene.dispatch({
        type: LIGHTER_EVENTS.SCENE_OPTIONS_CHANGED,
        detail: sceneOptions,
      });
    }
  }, [scene, options.activePaths, options.showOverlays, options.alpha]);

  const addOverlay = useCallback(
    (overlay: BaseOverlay) => {
      if (scene) {
        scene.addOverlay(overlay);
      }
    },
    [scene]
  );

  const removeOverlay = useCallback(
    (id: string) => {
      if (scene) {
        scene.removeOverlay(id);
        setOverlayCount((prev) => Math.max(0, prev - 1));
      }
    },
    [scene]
  );

  const undo = useCallback(() => {
    if (scene && scene.canUndo()) {
      scene.undo();
    }
  }, [scene]);

  const redo = useCallback(() => {
    if (scene && scene.canRedo()) {
      scene.redo();
    }
  }, [scene]);

  const canUndo = useCallback(() => {
    return scene ? scene.canUndo() : false;
  }, [scene]);

  const canRedo = useCallback(() => {
    return scene ? scene.canRedo() : false;
  }, [scene]);

  return {
    scene,
    isReady,
    overlayCount,
    addOverlay,
    removeOverlay,
    undo,
    redo,
    canUndo,
    canRedo,
    overlayFactory: overlayFactoryInstance || overlayFactory,
    options,
  };
};

/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { useCallback, useEffect, useState } from "react";
import {
  BoundingBoxOverlay,
  ClassificationOverlay,
  EventBus,
  PixiRenderer2D,
  PixiResourceLoader,
  Scene2D,
} from "../index";

/**
 * Hook for using the Lighter library in React components.
 */
export const useLighter = (canvasRef: React.RefObject<HTMLCanvasElement>) => {
  const [scene, setScene] = useState<Scene2D | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [overlayCount, setOverlayCount] = useState(0);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const renderer = new PixiRenderer2D(canvas);
    const resourceLoader = new PixiResourceLoader();
    const eventBus = new EventBus();

    const sceneInstance = new Scene2D({
      canvas,
      renderer,
      resourceLoader,
      eventBus,
    });

    eventBus.on("overlay-loaded", (event) => {
      setOverlayCount((prev) => prev + 1);
    });

    (async () => {
      await renderer.initializePixiJS();
      await sceneInstance.startRenderLoop();
      setScene(sceneInstance);
      setIsReady(true);
    })();

    return () => {
      sceneInstance.destroy();
      setScene(null);
      setIsReady(false);
    };
  }, [canvasRef]);

  const addOverlay = useCallback(
    (overlay: BoundingBoxOverlay | ClassificationOverlay) => {
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

  const clearOverlays = useCallback(() => {
    if (scene) {
      scene.clear();
      setOverlayCount(0);
    }
  }, [scene]);

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
    clearOverlays,
    undo,
    redo,
    canUndo,
    canRedo,
  };
};

/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { useCallback, useEffect, useState } from "react";
import { PixiRenderer2D } from "../renderer/PixiRenderer2D";

/**
 * Hook for creating and managing a PixiRenderer2D instance.
 */
export const usePixiRenderer = (
  canvasRef: React.RefObject<HTMLCanvasElement>
) => {
  const [renderer, setRenderer] = useState<PixiRenderer2D | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const pixiRenderer = new PixiRenderer2D(canvas);

    const initializeRenderer = async () => {
      try {
        await pixiRenderer.initializePixiJS();
        setRenderer(pixiRenderer);
        setIsInitialized(true);
      } catch (error) {
        console.error("Failed to initialize PixiRenderer2D:", error);
      }
    };

    initializeRenderer();

    return () => {
      if (pixiRenderer) {
        pixiRenderer.stopRenderLoop();
      }
      setRenderer(null);
      setIsInitialized(false);
    };
  }, [canvasRef]);

  const startRenderLoop = useCallback(
    (onFrame: () => void) => {
      if (renderer) {
        renderer.startRenderLoop(onFrame);
      }
    },
    [renderer]
  );

  const stopRenderLoop = useCallback(() => {
    if (renderer) {
      renderer.stopRenderLoop();
    }
  }, [renderer]);

  return {
    renderer,
    isInitialized,
    startRenderLoop,
    stopRenderLoop,
  };
};

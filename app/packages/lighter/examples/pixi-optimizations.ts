/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import {
  Scene2D,
  PixiRenderer2D,
  PixiResourceLoader,
  EventBus,
  BoundingBoxOverlay,
  ClassificationOverlay,
} from "../src";

/**
 * Example demonstrating PixiJS v8 performance optimizations.
 */
export function createOptimizedScene(canvas: HTMLCanvasElement) {
  // Create renderer with performance optimizations
  const renderer = new PixiRenderer2D(canvas);
  const resourceLoader = new PixiResourceLoader();
  const eventBus = new EventBus();

  const scene = new Scene2D({
    canvas,
    renderer,
    resourceLoader,
    eventBus,
  });

  // Get PixiJS app for advanced optimizations
  const pixiApp = renderer.getPixiApp();
  const stage = renderer.getStage();

  // Performance optimization: Use ParticleContainer for many similar objects
  const particleContainer = new (window as any).PIXI.ParticleContainer(1000, {
    scale: true,
    position: true,
    rotation: true,
    uvs: true,
    alpha: true,
  });

  stage.addChild(particleContainer);

  // Performance optimization: Cache static overlays as textures
  const cacheStaticOverlays = () => {
    const overlays = scene.getAllOverlays();
    overlays.forEach((overlay) => {
      const container = renderer.getOverlayContainer(overlay.id);
      if (container) {
        renderer.cacheAsTexture(container);
      }
    });
  };

  // Performance optimization: Batch overlay creation
  const batchCreateOverlays = (overlayData: any[]) => {
    // Create overlays in batches to avoid blocking the main thread
    const batchSize = 50;
    let currentIndex = 0;

    const processBatch = () => {
      const batch = overlayData.slice(currentIndex, currentIndex + batchSize);

      batch.forEach((data) => {
        if (data.type === "bounding-box") {
          const overlay = new BoundingBoxOverlay(data);
          scene.addOverlay(overlay);
        } else if (data.type === "classification") {
          const overlay = new ClassificationOverlay(data);
          scene.addOverlay(overlay);
        }
      });

      currentIndex += batchSize;

      if (currentIndex < overlayData.length) {
        // Process next batch in next frame
        requestAnimationFrame(processBatch);
      } else {
        // All overlays created, cache static ones
        cacheStaticOverlays();
      }
    };

    processBatch();
  };

  // Performance optimization: Monitor frame rate
  let frameCount = 0;
  let lastTime = performance.now();
  let fps = 0;

  eventBus.on("overlay-loaded", () => {
    frameCount++;

    if (frameCount % 60 === 0) {
      const currentTime = performance.now();
      fps = 1000 / ((currentTime - lastTime) / 60);
      lastTime = currentTime;

      console.log(`Current FPS: ${fps.toFixed(1)}`);

      // Adaptive optimization based on performance
      if (fps < 30) {
        console.log(
          "Performance warning: Consider reducing overlay count or enabling more optimizations"
        );
      }
    }
  });

  // Performance optimization: Efficient memory management
  const cleanup = () => {
    // Clean up resources when done
    scene.destroy();
    pixiApp.destroy(true);
  };

  return {
    scene,
    renderer,
    pixiApp,
    stage,
    particleContainer,
    batchCreateOverlays,
    cacheStaticOverlays,
    cleanup,
    getFPS: () => fps,
  };
}

/**
 * Example of using advanced PixiJS v8 features for maximum performance.
 */
export function createHighPerformanceScene(canvas: HTMLCanvasElement) {
  const renderer = new PixiRenderer2D(canvas);
  const resourceLoader = new PixiResourceLoader();
  const eventBus = new EventBus();

  const scene = new Scene2D({
    canvas,
    renderer,
    resourceLoader,
    eventBus,
  });

  const pixiApp = renderer.getPixiApp();

  // Advanced optimization: Custom render groups
  if (pixiApp.renderer) {
    // Set up custom render groups for better batching
    pixiApp.renderer.runners.prerender.emit();
  }

  // Advanced optimization: Level of detail (LOD)
  const createLODSystem = () => {
    let zoomLevel = 1;

    const updateLOD = (newZoom: number) => {
      zoomLevel = newZoom;

      // Adjust overlay detail based on zoom level
      const overlays = scene.getAllOverlays();
      overlays.forEach((overlay) => {
        const container = renderer.getOverlayContainer(overlay.id);
        if (container) {
          if (zoomLevel < 0.5) {
            // Low detail: hide labels, simplify shapes
            container.visible = false;
          } else if (zoomLevel < 1) {
            // Medium detail: show basic shapes
            container.visible = true;
            container.alpha = 0.7;
          } else {
            // High detail: show everything
            container.visible = true;
            container.alpha = 1;
          }
        }
      });
    };

    return { updateLOD };
  };

  // Advanced optimization: Spatial indexing for large datasets
  const createSpatialIndex = () => {
    const spatialGrid = new Map<string, Set<string>>();
    const gridSize = 100;

    const getGridKey = (x: number, y: number) => {
      const gridX = Math.floor(x / gridSize);
      const gridY = Math.floor(y / gridSize);
      return `${gridX},${gridY}`;
    };

    const addToIndex = (overlayId: string, bounds: any) => {
      const key = getGridKey(bounds.x, bounds.y);
      if (!spatialGrid.has(key)) {
        spatialGrid.set(key, new Set());
      }
      spatialGrid.get(key)!.add(overlayId);
    };

    const getVisibleOverlays = (viewport: any) => {
      const visible = new Set<string>();
      const startKey = getGridKey(viewport.x, viewport.y);
      const endKey = getGridKey(
        viewport.x + viewport.width,
        viewport.y + viewport.height
      );

      // Get all grid cells in viewport
      const [startX, startY] = startKey.split(",").map(Number);
      const [endX, endY] = endKey.split(",").map(Number);

      for (let x = startX; x <= endX; x++) {
        for (let y = startY; y <= endY; y++) {
          const key = `${x},${y}`;
          const overlays = spatialGrid.get(key);
          if (overlays) {
            overlays.forEach((id) => visible.add(id));
          }
        }
      }

      return Array.from(visible);
    };

    return { addToIndex, getVisibleOverlays };
  };

  return {
    scene,
    renderer,
    pixiApp,
    createLODSystem,
    createSpatialIndex,
  };
}

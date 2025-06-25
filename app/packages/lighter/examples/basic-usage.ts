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
  OverlayFactory,
} from "../src";

/**
 * Basic usage example for the Lighter library.
 */
export function createBasicScene(canvas: HTMLCanvasElement) {
  // Create renderer
  const renderer = new PixiRenderer2D(canvas);

  // Create resource loader
  const resourceLoader = new PixiResourceLoader();

  // Create event bus
  const eventBus = new EventBus();

  // Create scene
  const scene = new Scene2D({
    canvas,
    renderer,
    resourceLoader,
    eventBus,
  });

  // Listen for events
  eventBus.on("overlay-loaded", (event) => {
    console.log("Overlay loaded:", event.detail.id);
  });

  eventBus.on("undo", (event) => {
    console.log("Undo command:", event.detail.commandId);
  });

  eventBus.on("redo", (event) => {
    console.log("Redo command:", event.detail.commandId);
  });

  // Add a bounding box overlay
  const boundingBox = new BoundingBoxOverlay({
    bounds: { x: 100, y: 100, width: 200, height: 150 },
    style: {
      strokeStyle: "#ff0000",
      lineWidth: 2,
      fillStyle: "rgba(255, 0, 0, 0.1)",
    },
    label: "person",
    confidence: 0.95,
  });

  scene.addOverlay(boundingBox);

  // Add a classification overlay
  const classification = new ClassificationOverlay({
    label: "car",
    confidence: 0.87,
    position: { x: 50, y: 50 },
    style: { strokeStyle: "#00ff00" },
    showConfidence: true,
  });

  scene.addOverlay(classification);

  // Get overlays by tag
  const detectionOverlays = scene.getOverlaysByTag("detection");
  console.log("Detection overlays:", detectionOverlays.length);

  // Example undo/redo usage
  const undoButton = document.createElement("button");
  undoButton.textContent = "Undo";
  undoButton.onclick = () => {
    if (scene.canUndo()) {
      scene.undo();
    }
  };

  const redoButton = document.createElement("button");
  redoButton.textContent = "Redo";
  redoButton.onclick = () => {
    if (scene.canRedo()) {
      scene.redo();
    }
  };

  // Clean up when done
  return {
    scene,
    eventBus,
    cleanup: () => {
      scene.destroy();
    },
  };
}

/**
 * Example of using the overlay factory pattern.
 */
export function createSceneWithFactory(canvas: HTMLCanvasElement) {
  const renderer = new PixiRenderer2D(canvas);
  const resourceLoader = new PixiResourceLoader();
  const eventBus = new EventBus();

  const scene = new Scene2D({
    canvas,
    renderer,
    resourceLoader,
    eventBus,
  });

  // Create overlay factory
  const factory = new OverlayFactory();

  // Register overlay types
  factory.register("bounding-box", (opts: any) => new BoundingBoxOverlay(opts));
  factory.register(
    "classification",
    (opts: any) => new ClassificationOverlay(opts)
  );

  // Create overlays using factory
  const bbox = factory.create("bounding-box", {
    bounds: { x: 0, y: 0, width: 100, height: 100 },
    style: { strokeStyle: "#0000ff" },
  });

  const cls = factory.create("classification", {
    label: "object",
    confidence: 0.5,
    position: { x: 10, y: 10 },
  });

  scene.addOverlay(bbox);
  scene.addOverlay(cls);

  return { scene, factory };
}

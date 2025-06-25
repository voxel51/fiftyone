/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import {
  Scene2D,
  LighterEventBus,
  DefaultRenderStrategy2D,
  DefaultResourceLoader,
  createOverlay,
  BoundingBoxOverlayOptions,
  ClassificationOverlayOptions,
  OVERLAY_LOADED_EVENT,
  OVERLAY_ERROR_EVENT,
  OVERLAY_UPDATED_EVENT,
} from "../index";

/**
 * Sample usage of the lighter package.
 */
export function createSampleScene(): Scene2D {
  // Create a canvas element
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 600;
  document.body.appendChild(canvas);

  // Create the required dependencies
  const eventBus = LighterEventBus.create();
  const renderStrategy = new DefaultRenderStrategy2D();
  const resourceLoader = new DefaultResourceLoader();

  // Create the scene
  const scene = new Scene2D({
    canvas,
    renderStrategy,
    resourceLoader,
    eventBus,
    enableUndoRedo: true,
    maxUndoStackSize: 50,
  });

  // Set up event listeners
  eventBus.on(OVERLAY_LOADED_EVENT, (event) => {
    console.log("Overlay loaded:", event.detail?.overlayId);
  });

  eventBus.on(OVERLAY_ERROR_EVENT, (event) => {
    const errorEvent = event as any;
    console.error("Overlay error:", errorEvent.detail?.error);
  });

  eventBus.on(OVERLAY_UPDATED_EVENT, (event) => {
    const updateEvent = event as any;
    console.log(
      "Overlay updated:",
      updateEvent.detail?.overlayId,
      updateEvent.detail?.changes
    );
  });

  // Create some sample overlays
  const boundingBoxOverlay = createOverlay<BoundingBoxOverlayOptions>(
    "bounding-box",
    {
      id: "bbox-1",
      name: "Sample Bounding Box",
      tags: ["detection", "object"],
      bounds: { x: 100, y: 100, width: 200, height: 150 },
      label: "Person",
      confidence: 0.85,
      strokeColor: "#00ff00",
      lineWidth: 2,
      showLabel: true,
      zIndex: 1,
    }
  );

  const classificationOverlay = createOverlay<ClassificationOverlayOptions>(
    "classification",
    {
      id: "classification-1",
      name: "Sample Classification",
      tags: ["classification"],
      position: { x: 50, y: 50 },
      labels: [
        { id: "label-1", label: "Cat", confidence: 0.92, color: "#ff6600" },
        { id: "label-2", label: "Dog", confidence: 0.78, color: "#0066ff" },
        { id: "label-3", label: "Bird", confidence: 0.34, color: "#ff0066" },
      ],
      showConfidence: true,
      backgroundColor: "rgba(0, 0, 0, 0.8)",
      textColor: "#ffffff",
      zIndex: 2,
    }
  );

  // Add overlays to the scene
  scene.addOverlay(boundingBoxOverlay);
  scene.addOverlay(classificationOverlay);

  // Start the render loop
  scene.startRenderLoop();

  // Set up some interactive features
  setupInteractions(scene, canvas);

  return scene;
}

/**
 * Sets up mouse interactions for the scene.
 */
function setupInteractions(scene: Scene2D, canvas: HTMLCanvasElement): void {
  let isDragging = false;
  let draggedOverlay: any = null;

  canvas.addEventListener("mousedown", (event) => {
    const rect = canvas.getBoundingClientRect();
    const point = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };

    // Find the topmost overlay at this point
    const overlays = scene.getOverlaysSortedByZIndex().reverse();
    for (const overlay of overlays) {
      if (overlay.hitTest(point)) {
        // Check if it's a bounding box overlay with selection capabilities
        if ("setSelected" in overlay) {
          (overlay as any).setSelected(true);
          if ("startDrag" in overlay) {
            isDragging = true;
            draggedOverlay = overlay;
            (overlay as any).startDrag(point);
          }
        }
        break;
      }
    }
  });

  canvas.addEventListener("mousemove", (event) => {
    const rect = canvas.getBoundingClientRect();
    const point = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };

    if (isDragging && draggedOverlay) {
      // Update drag operation
      if ("updateDrag" in draggedOverlay) {
        draggedOverlay.updateDrag(point);
      }
    } else {
      // Handle hover states
      const overlays = scene.getAllOverlays();
      for (const overlay of overlays) {
        if ("setHovered" in overlay) {
          const isHovered = overlay.hitTest(point);
          (overlay as any).setHovered(isHovered);
        }
      }
    }
  });

  canvas.addEventListener("mouseup", () => {
    if (isDragging && draggedOverlay) {
      // End drag operation
      if ("endDrag" in draggedOverlay) {
        draggedOverlay.endDrag();
      }
      isDragging = false;
      draggedOverlay = null;
    }
  });

  // Add keyboard shortcuts for undo/redo
  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey) {
      if (event.key === "z" && !event.shiftKey) {
        // Undo
        scene["undoRedoManager"]?.undo();
        event.preventDefault();
      } else if ((event.key === "z" && event.shiftKey) || event.key === "y") {
        // Redo
        scene["undoRedoManager"]?.redo();
        event.preventDefault();
      }
    }
  });
}

/**
 * Example of creating a custom overlay type.
 */
export function createCustomOverlayExample(): void {
  // This would be a more complex example showing how to:
  // 1. Create a custom overlay class extending BaseOverlay
  // 2. Register it with the factory
  // 3. Use it in a scene

  console.log("Custom overlay example would go here");
}

// Export the sample function for easy testing
if (typeof window !== "undefined") {
  (window as any).createSampleScene = createSampleScene;
}

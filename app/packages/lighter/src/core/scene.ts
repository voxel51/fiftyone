/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type {
  Overlay,
  RenderContext,
  SceneDimension,
  Resource,
  BoundingBox,
} from "../types";
import type {
  RenderStrategy2D,
  RenderStrategy3D,
} from "../rendering/strategies";
import type { ResourceLoader } from "../resources/loader";
import {
  LighterEventBus,
  OverlayLoadedEvent,
  OverlayErrorEvent,
  OverlayUpdatedEvent,
  OVERLAY_LOADED_EVENT,
  OVERLAY_ERROR_EVENT,
  OVERLAY_UPDATED_EVENT,
} from "./events";
import {
  UndoRedoManager,
  AddOverlayCommand,
  RemoveOverlayCommand,
} from "../undo/undo-redo-manager";

/**
 * Configuration for the scene.
 */
export interface SceneConfig {
  dimension: SceneDimension;
  canvas: HTMLCanvasElement;
  renderStrategy: RenderStrategy2D | RenderStrategy3D;
  resourceLoader: ResourceLoader;
  eventBus: LighterEventBus;
  enableUndoRedo?: boolean;
  maxUndoStackSize?: number;
}

/**
 * Abstract base scene class.
 */
export abstract class Scene<
  TStrategy extends RenderStrategy2D | RenderStrategy3D
> {
  protected config: SceneConfig;
  protected overlays = new Map<string, Overlay>();
  protected renderStrategy: TStrategy;
  protected resourceLoader: ResourceLoader;
  protected eventBus: LighterEventBus;
  protected undoRedoManager?: UndoRedoManager;
  protected renderContext: RenderContext;
  protected isDirty = true;
  protected animationFrameId?: number;

  constructor(config: SceneConfig) {
    this.config = config;
    this.renderStrategy = config.renderStrategy as TStrategy;
    this.resourceLoader = config.resourceLoader;
    this.eventBus = config.eventBus;

    if (config.enableUndoRedo !== false) {
      this.undoRedoManager = new UndoRedoManager(
        this.eventBus,
        config.maxUndoStackSize
      );
    }

    this.renderContext = this.createRenderContext();
    this.setupEventListeners();
  }

  /**
   * Adds an overlay to the scene.
   */
  addOverlay(overlay: Overlay): void {
    if (this.overlays.has(overlay.id)) {
      throw new Error(`Overlay with id '${overlay.id}' already exists`);
    }

    const addFunction = () => {
      this.overlays.set(overlay.id, overlay);
      this.sortOverlaysByZIndex();
      this.markDirty();
      this.eventBus.emit(
        new OverlayLoadedEvent({ overlayId: overlay.id, overlay })
      );
    };

    const removeFunction = () => {
      this.overlays.delete(overlay.id);
      this.markDirty();
    };

    if (this.undoRedoManager) {
      const command = new AddOverlayCommand(
        overlay.id,
        addFunction,
        removeFunction
      );
      this.undoRedoManager.executeCommand(command);
    } else {
      addFunction();
    }
  }

  /**
   * Removes an overlay from the scene.
   */
  removeOverlay(id: string): boolean {
    const overlay = this.overlays.get(id);
    if (!overlay) {
      return false;
    }

    const removeFunction = () => {
      this.overlays.delete(id);
      this.markDirty();
      overlay.dispose();
    };

    const restoreFunction = () => {
      this.overlays.set(id, overlay);
      this.sortOverlaysByZIndex();
      this.markDirty();
    };

    if (this.undoRedoManager) {
      const command = new RemoveOverlayCommand(
        id,
        removeFunction,
        restoreFunction
      );
      this.undoRedoManager.executeCommand(command);
    } else {
      removeFunction();
    }

    return true;
  }

  /**
   * Sets the z-order of an overlay.
   */
  setZOrder(id: string, zIndex: number): boolean {
    const overlay = this.overlays.get(id);
    if (!overlay) {
      return false;
    }

    const previousZIndex = overlay.zIndex;
    overlay.zIndex = zIndex;
    this.sortOverlaysByZIndex();
    this.markDirty();

    this.eventBus.emit(
      new OverlayUpdatedEvent({
        overlayId: id,
        overlay,
        changes: { zIndex },
        previousState: { zIndex: previousZIndex },
      })
    );

    return true;
  }

  /**
   * Gets an overlay by ID.
   */
  getOverlay(id: string): Overlay | undefined {
    return this.overlays.get(id);
  }

  /**
   * Gets all overlays.
   */
  getAllOverlays(): Overlay[] {
    return Array.from(this.overlays.values());
  }

  /**
   * Gets overlays sorted by z-index.
   */
  getOverlaysSortedByZIndex(): Overlay[] {
    return Array.from(this.overlays.values()).sort(
      (a, b) => a.zIndex - b.zIndex
    );
  }

  /**
   * Clears all overlays.
   */
  clearOverlays(): void {
    for (const overlay of this.overlays.values()) {
      overlay.dispose();
    }
    this.overlays.clear();
    this.markDirty();
  }

  /**
   * Loads a resource for an overlay.
   */
  async loadResource(resource: Resource, overlayId: string): Promise<void> {
    const overlay = this.overlays.get(overlayId);
    if (!overlay) {
      throw new Error(`Overlay with id '${overlayId}' not found`);
    }

    overlay.renderStatus = "pending";
    let retryAttempt = 0;

    const attemptLoad = async (): Promise<void> => {
      try {
        const loadedResource = await this.resourceLoader.load({
          ...resource,
          retryCount: retryAttempt,
        });

        overlay.renderStatus = "decoded";
        this.eventBus.emit(new OverlayLoadedEvent({ overlayId, overlay }));
      } catch (error) {
        retryAttempt++;
        const maxRetries = 2;

        if (retryAttempt <= maxRetries) {
          // Retry
          return attemptLoad();
        } else {
          // Max retries exceeded
          this.eventBus.emit(
            new OverlayErrorEvent({
              overlayId,
              overlay,
              error: error instanceof Error ? error : new Error(String(error)),
              retryAttempt,
            })
          );
        }
      }
    };

    await attemptLoad();
  }

  /**
   * Renders the scene.
   */
  render(): void {
    if (!this.isDirty) {
      return;
    }

    const { canvas, ctx } = this.renderContext;

    // Clear the canvas
    this.renderStrategy.clear(ctx);

    // Render overlays in z-index order
    const sortedOverlays = this.getOverlaysSortedByZIndex();

    for (const overlay of sortedOverlays) {
      if (
        overlay.renderStatus === "painted" ||
        overlay.renderStatus === "decoded"
      ) {
        overlay.renderStatus = "painting";
        overlay.render(this.renderContext);
        overlay.renderStatus = "painted";
      }
    }

    this.isDirty = false;
  }

  /**
   * Starts the render loop.
   */
  startRenderLoop(): void {
    if (this.animationFrameId) {
      return; // Already running
    }

    const loop = () => {
      this.render();
      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  /**
   * Stops the render loop.
   */
  stopRenderLoop(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = undefined;
    }
  }

  /**
   * Marks the scene as needing a re-render.
   */
  markDirty(): void {
    this.isDirty = true;
  }

  /**
   * Gets the render context.
   */
  getRenderContext(): RenderContext {
    return { ...this.renderContext };
  }

  /**
   * Disposes of the scene and cleans up resources.
   */
  dispose(): void {
    this.stopRenderLoop();
    this.clearOverlays();
    this.undoRedoManager?.dispose();
    this.eventBus.removeAllListeners();
  }

  protected abstract createRenderContext(): RenderContext;

  protected sortOverlaysByZIndex(): void {
    // The overlays are stored in a Map, so we don't need to sort them here
    // The sorting happens in getOverlaysSortedByZIndex() when needed
  }

  protected setupEventListeners(): void {
    // Listen for overlay update events to mark scene as dirty
    this.eventBus.on(OVERLAY_UPDATED_EVENT, () => {
      this.markDirty();
    });

    this.eventBus.on(OVERLAY_LOADED_EVENT, () => {
      this.markDirty();
    });

    this.eventBus.on(OVERLAY_ERROR_EVENT, () => {
      this.markDirty();
    });
  }
}

/**
 * 2D Scene implementation.
 */
export class Scene2D extends Scene<RenderStrategy2D> {
  constructor(config: Omit<SceneConfig, "dimension"> & { dimension?: "2d" }) {
    super({ ...config, dimension: "2d" });
  }

  protected createRenderContext(): RenderContext {
    const canvas = this.config.canvas;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("Failed to get 2D context from canvas");
    }

    return {
      canvas,
      ctx,
      width: canvas.width,
      height: canvas.height,
      scale: window.devicePixelRatio || 1,
      viewport: {
        x: 0,
        y: 0,
        width: canvas.width,
        height: canvas.height,
      },
    };
  }

  /**
   * Updates the viewport.
   */
  setViewport(viewport: BoundingBox): void {
    this.renderContext.viewport = { ...viewport };
    this.markDirty();
  }

  /**
   * Fits the viewport to show all overlays.
   */
  fitToOverlays(padding = 20): void {
    const overlays = this.getAllOverlays();
    if (overlays.length === 0) {
      return;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const overlay of overlays) {
      const bounds = overlay.getBounds();
      minX = Math.min(minX, bounds.x);
      minY = Math.min(minY, bounds.y);
      maxX = Math.max(maxX, bounds.x + bounds.width);
      maxY = Math.max(maxY, bounds.y + bounds.height);
    }

    const viewport = {
      x: minX - padding,
      y: minY - padding,
      width: maxX - minX + padding * 2,
      height: maxY - minY + padding * 2,
    };

    this.setViewport(viewport);
  }
}

/**
 * 3D Scene implementation (stub).
 */
export class Scene3D extends Scene<RenderStrategy3D> {
  constructor(config: Omit<SceneConfig, "dimension"> & { dimension?: "3d" }) {
    super({ ...config, dimension: "3d" });
  }

  protected createRenderContext(): RenderContext {
    throw new Error("3D rendering not implemented");
  }
}

/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { LIGHTER_EVENTS } from "../event/EventBus";
import type { BaseOverlay } from "../overlay/BaseOverlay";
import type { DrawStyle } from "../types";
import type { Command } from "../undo/Command";
import { UndoRedoManager } from "../undo/UndoRedoManager";
import {
  OVERLAY_STATUS_ERROR,
  OVERLAY_STATUS_PAINTED,
  OVERLAY_STATUS_PAINTING,
  OVERLAY_STATUS_PENDING,
  RenderingStateManager,
} from "./RenderingStateManager";
import type { Scene2DConfig } from "./SceneConfig";

/**
 * 2D scene that manages overlays, rendering, and undo/redo operations.
 */
export class Scene2D {
  private overlays = new Map<string, BaseOverlay>();
  private undoRedo = new UndoRedoManager();
  private overlayOrder: string[] = [];
  private renderingState = new RenderingStateManager();

  // todo: hook up with fiftyone colorscheme
  private static randomStyle(): DrawStyle {
    return {
      strokeStyle: `hsl(${Math.random() * 360}, 70%, 50%)`,
      fillStyle: `hsl(${Math.random() * 360}, 70%, 50%)`,
      lineWidth: 2,
      opacity: 1,
    };
  }

  constructor(private readonly config: Scene2DConfig) {}

  public async startRenderLoop(): Promise<void> {
    this.config.renderer.startRenderLoop(() => this.renderFrame());
  }

  /**
   * Adds an overlay to the scene.
   * @param overlay - The overlay to add.
   */
  addOverlay(overlay: BaseOverlay): void {
    if (this.overlays.has(overlay.id)) {
      return;
    }

    this.renderingState.setStatus(overlay.id, OVERLAY_STATUS_PENDING);
    // Inject renderer into overlay
    overlay.setRenderer(this.config.renderer);

    // Attach event bus
    overlay.attachEventBus(this.config.eventBus);

    overlay.setResourceLoader(this.config.resourceLoader);

    // Add to internal tracking
    this.overlays.set(overlay.id, overlay);
    this.overlayOrder.push(overlay.id);

    // Emit overlay-added event when overlay is added to scene
    this.config.eventBus.emit({
      type: LIGHTER_EVENTS.OVERLAY_ADDED,
      detail: { id: overlay.id },
    });
  }

  /**
   * Removes an overlay from the scene.
   * @param id - The ID of the overlay to remove.
   */
  removeOverlay(id: string): void {
    const overlay = this.overlays.get(id);
    if (overlay) {
      // Call destroy method for proper cleanup
      overlay.destroy();

      this.overlays.delete(id);
      this.overlayOrder = this.overlayOrder.filter(
        (overlayId) => overlayId !== id
      );
      this.renderingState.clear(id);
    }

    // Emit overlay-removed event
    this.config.eventBus.emit({
      type: LIGHTER_EVENTS.OVERLAY_REMOVED,
      detail: { id },
    });
  }

  /**
   * Sets the rendering order of overlays.
   * @param order - Array of overlay IDs in the desired rendering order.
   */
  setOverlayOrder(order: string[]): void {
    // Validate that all IDs exist
    const validIds = order.filter((id) => this.overlays.has(id));
    if (validIds.length !== order.length) {
      throw new Error("Some overlay IDs in order array do not exist");
    }

    this.overlayOrder = validIds;
  }

  /**
   * Gets an overlay by ID.
   * @param id - The overlay ID.
   * @returns The overlay, or undefined if not found.
   */
  getOverlay(id: string): BaseOverlay | undefined {
    return this.overlays.get(id);
  }

  /**
   * Gets all overlays in the scene.
   * @returns Array of all overlays.
   */
  getAllOverlays(): BaseOverlay[] {
    return Array.from(this.overlays.values());
  }

  /**
   * Gets overlays by tag.
   * @param tag - The tag to filter by.
   * @returns Array of overlays with the specified tag.
   */
  getOverlaysByTag(tag: string): BaseOverlay[] {
    return this.getAllOverlays().filter((overlay) =>
      overlay.tags.includes(tag)
    );
  }

  /**
   * Executes a command and adds it to the undo stack.
   * @param command - The command to execute.
   */
  executeCommand(command: Command): void {
    command.execute();
    this.undoRedo.push(command);

    // Emit undo/redo event
    this.config.eventBus.emit({
      type: LIGHTER_EVENTS.UNDO,
      detail: { commandId: command.id },
    });
  }

  /**
   * Undoes the last command.
   */
  undo(): void {
    const command = this.undoRedo.undo();
    if (command) {
      this.config.eventBus.emit({
        type: LIGHTER_EVENTS.UNDO,
        detail: { commandId: command.id },
      });
    }
  }

  /**
   * Redoes the last undone command.
   */
  redo(): void {
    const command = this.undoRedo.redo();
    if (command) {
      this.config.eventBus.emit({
        type: LIGHTER_EVENTS.REDO,
        detail: { commandId: command.id },
      });
    }
  }

  /**
   * Checks if undo is available.
   * @returns True if undo is available.
   */
  canUndo(): boolean {
    return this.undoRedo.canUndo();
  }

  /**
   * Checks if redo is available.
   * @returns True if redo is available.
   */
  canRedo(): boolean {
    return this.undoRedo.canRedo();
  }

  /**
   * Clears all overlays from the scene.
   */
  clear(): void {
    // Call destroy on all overlays for proper cleanup
    for (const overlay of this.overlays.values()) {
      overlay.destroy();
    }

    this.overlays.clear();
    this.overlayOrder = [];
    this.renderingState.clearAll();
    this.config.renderer.clear();
  }

  /**
   * Destroys the scene and cleans up resources.
   */
  destroy(): void {
    this.config.renderer.stopRenderLoop();
    this.clear();
    this.undoRedo.clear();
  }

  /**
   * Renders a single frame.
   */
  private renderFrame(): void {
    for (const overlayId of this.overlayOrder) {
      this.renderOverlay(overlayId);
    }
  }

  /**
   * Renders a specific overlay if it's pending.
   * @param overlayId - The ID of the overlay to render.
   */
  private renderOverlay(overlayId: string): void {
    const overlay = this.overlays.get(overlayId);
    const status = this.renderingState.getStatus(overlayId);

    if (this.shouldRenderOverlay(overlay, status)) {
      this.executeOverlayRender(overlayId, overlay!);
    }
  }

  /**
   * Determines if an overlay should be rendered.
   * @param overlay - The overlay to check.
   * @param status - The current rendering status.
   * @returns True if the overlay should be rendered.
   */
  private shouldRenderOverlay(
    overlay: BaseOverlay | undefined,
    status: string
  ): boolean {
    return (
      overlay !== undefined &&
      (status === OVERLAY_STATUS_PENDING || overlay.getIsDirty())
    );
  }

  /**
   * Executes the rendering of an overlay with proper error handling.
   * @param overlayId - The ID of the overlay being rendered.
   * @param overlay - The overlay to render.
   */
  private executeOverlayRender(overlayId: string, overlay: BaseOverlay): void {
    this.renderingState.setStatus(overlayId, OVERLAY_STATUS_PAINTING);

    try {
      const ret = overlay.render(this.config.renderer, Scene2D.randomStyle());
      if (ret instanceof Promise) {
        ret.then(() => {
          this.renderingState.setStatus(overlayId, OVERLAY_STATUS_PAINTED);
          overlay.markClean(); // Mark as clean after successful render
        });
      } else {
        this.renderingState.setStatus(overlayId, OVERLAY_STATUS_PAINTED);
        overlay.markClean(); // Mark as clean after successful render
      }
    } catch (error) {
      this.handleRenderError(overlayId, error);
    }
  }

  /**
   * Handles rendering errors for an overlay.
   * @param overlayId - The ID of the overlay that encountered an error.
   * @param error - The error that occurred during rendering.
   */
  private handleRenderError(overlayId: string, error: unknown): void {
    this.renderingState.setStatus(overlayId, OVERLAY_STATUS_ERROR);
    // Optionally handle error - could emit an event or log the error
    console.error(`Error rendering overlay ${overlayId}:`, error);
  }
}

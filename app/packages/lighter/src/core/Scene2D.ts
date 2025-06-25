/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type { BaseOverlay } from "../overlay/BaseOverlay";
import type { Command } from "../undo/Command";
import { UndoRedoManager } from "../undo/UndoRedoManager";
import type { Scene2DConfig } from "./SceneConfig";

/**
 * 2D scene that manages overlays, rendering, and undo/redo operations.
 */
export class Scene2D {
  private overlays = new Map<string, BaseOverlay>();
  private undoRedo = new UndoRedoManager();
  private overlayOrder: string[] = [];

  constructor(private config: Scene2DConfig) {}

  public async startRenderLoop(): Promise<void> {
    this.config.renderer.startRenderLoop(() => this.renderFrame());
  }

  /**
   * Adds an overlay to the scene.
   * @param overlay - The overlay to add.
   */
  addOverlay(overlay: BaseOverlay): void {
    // Inject renderer into overlay
    overlay.setRenderer(this.config.renderer);

    // Attach event bus
    overlay.attachEventBus(this.config.eventBus);

    // Add to internal tracking
    this.overlays.set(overlay.id, overlay);
    this.overlayOrder.push(overlay.id);

    // Add to renderer
    this.config.renderer.addOverlay(overlay);

    // Emit overlay-loaded event when resource loading is complete
    this.config.eventBus.emit({
      type: "overlay-loaded",
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
      this.overlays.delete(id);
      this.overlayOrder = this.overlayOrder.filter(
        (overlayId) => overlayId !== id
      );
      this.config.renderer.removeOverlay(id);
    }

    // Emit overlay-removed event
    this.config.eventBus.emit({
      type: "overlay-removed",
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
      type: "undo",
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
        type: "undo",
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
        type: "redo",
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
    this.overlays.clear();
    this.overlayOrder = [];
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
    // Render overlays in order
    for (const overlayId of this.overlayOrder) {
      const overlay = this.overlays.get(overlayId);

      if (overlay && overlay?.status !== "painted") {
        overlay.render(this.config.renderer);
      }
    }
  }
}

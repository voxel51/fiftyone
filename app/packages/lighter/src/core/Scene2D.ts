/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { EventBus, LIGHTER_EVENTS } from "../event/EventBus";
import { InteractionManager } from "../interaction/InteractionManager";
import type { BaseOverlay } from "../overlay/BaseOverlay";
import type { Selectable } from "../selection/Selectable";
import { SelectionManager } from "../selection/SelectionManager";
import type { DrawStyle } from "../types";
import type { Command } from "../undo/Command";
import { type Movable } from "../undo/MoveOverlayCommand";
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
 * 2D scene that manages overlays, rendering, selection, and undo/redo operations.
 */
export class Scene2D {
  private overlays = new Map<string, BaseOverlay>();
  private undoRedo = new UndoRedoManager();
  private overlayOrder: string[] = [];
  private renderingState = new RenderingStateManager();
  private interactionManager: InteractionManager;
  private selectionManager: SelectionManager;

  // todo: hook up with fiftyone colorscheme
  private static getStyleFromId(id: string): DrawStyle {
    // Create a hash from the overlay ID for deterministic color generation
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      const char = id.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    // Use hash to generate consistent HSL color
    const hue = Math.abs(hash) % 360;
    const saturation = 70;
    const lightness = 50;

    return {
      strokeStyle: `hsl(${hue}, ${saturation}%, ${lightness}%)`,
      fillStyle: `hsl(${hue}, ${saturation}%, ${lightness}%)`,
      lineWidth: 2,
      opacity: 1,
    };
  }

  /**
   * Creates a style for an overlay, including selection-specific properties.
   * @param overlay - The overlay to create a style for.
   * @returns The draw style for the overlay.
   */
  private createOverlayStyle(overlay: BaseOverlay): DrawStyle {
    const baseStyle = Scene2D.getStyleFromId(overlay.id);

    // Check if overlay is selectable and selected
    if (this.isSelectable(overlay) && overlay.isSelected()) {
      return {
        ...baseStyle,
        isSelected: true,
        dashPattern: [5, 5], // Dashed pattern for selected overlays
        selectionColor: "#ff6600", // Orange selection color
      };
    }

    return baseStyle;
  }

  constructor(private readonly config: Scene2DConfig) {
    // Initialize selection manager
    this.selectionManager = new SelectionManager(config.eventBus);

    // Initialize interaction manager
    this.interactionManager = new InteractionManager(
      config.canvas,
      config.eventBus,
      this.undoRedo,
      (id) => this.overlays.get(id)
    );

    // Connect interaction manager with selection manager
    this.interactionManager.setSelectionManager(this.selectionManager);
  }

  private isMovable(overlay: BaseOverlay): overlay is BaseOverlay & Movable {
    return "getPosition" in overlay && "setPosition" in overlay;
  }

  private isSelectable(
    overlay: BaseOverlay
  ): overlay is BaseOverlay & Selectable {
    return "isSelected" in overlay && "setSelected" in overlay;
  }

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

    // Register overlay with interaction manager
    this.interactionManager.addHandler(overlay);

    // Register overlay with selection manager if it's selectable
    if (this.isSelectable(overlay)) {
      this.selectionManager.addSelectable(overlay);
    }

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
      // Remove from interaction manager
      this.interactionManager.removeHandler(overlay);

      // Remove from selection manager
      this.selectionManager.removeSelectable(id);

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
   * Gets the event bus for the scene.
   * @returns The event bus.
   */
  getEventBus(): EventBus {
    return this.config.eventBus;
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
    this.interactionManager.clearHandlers();
    this.config.renderer.clear();
  }

  /**
   * Destroys the scene and cleans up resources.
   */
  destroy(): void {
    this.config.renderer.stopRenderLoop();
    this.clear();
    this.undoRedo.clear();
    this.interactionManager.destroy();
    this.selectionManager.destroy();
  }

  // Selection management methods

  /**
   * Gets the selection manager.
   * @returns The selection manager instance.
   */
  getSelectionManager(): SelectionManager {
    return this.selectionManager;
  }

  /**
   * Selects an overlay by ID.
   * @param id - The overlay ID to select.
   * @param addToSelection - If true, adds to current selection.
   */
  selectOverlay(id: string, addToSelection = false): void {
    this.selectionManager.select(id, addToSelection);
  }

  /**
   * Deselects an overlay by ID.
   * @param id - The overlay ID to deselect.
   */
  deselectOverlay(id: string): void {
    this.selectionManager.deselect(id);
  }

  /**
   * Toggles selection of an overlay by ID.
   * @param id - The overlay ID to toggle.
   * @param addToSelection - If true, adds to current selection when selecting.
   * @returns The new selection state.
   */
  toggleOverlaySelection(id: string, addToSelection = false): boolean {
    return this.selectionManager.toggle(id, addToSelection);
  }

  /**
   * Clears all selections.
   */
  clearSelection(): void {
    this.selectionManager.clearSelection();
  }

  /**
   * Gets the IDs of all selected overlays.
   * @returns Array of selected overlay IDs.
   */
  getSelectedOverlayIds(): string[] {
    return this.selectionManager.getSelectedIds();
  }

  /**
   * Gets all selected overlays.
   * @returns Array of selected overlay objects.
   */
  getSelectedOverlays(): BaseOverlay[] {
    return this.selectionManager
      .getSelectedIds()
      .map((id) => this.overlays.get(id))
      .filter((overlay): overlay is BaseOverlay => overlay !== undefined);
  }

  /**
   * Checks if an overlay is selected.
   * @param id - The overlay ID to check.
   * @returns True if the overlay is selected.
   */
  isOverlaySelected(id: string): boolean {
    return this.selectionManager.isSelected(id);
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
      const ret = overlay.render(
        this.config.renderer,
        this.createOverlayStyle(overlay)
      );
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

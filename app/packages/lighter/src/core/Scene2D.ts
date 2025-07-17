/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { EventBus, LIGHTER_EVENTS } from "../event/EventBus";
import { InteractionManager } from "../interaction/InteractionManager";
import type { BaseOverlay } from "../overlay/BaseOverlay";
import type { Selectable } from "../selection/Selectable";
import { SelectionManager } from "../selection/SelectionManager";
import type {
  CanonicalMedia,
  CoordinateSystem,
  DrawStyle,
  Spatial,
} from "../types";
import type { Command } from "../undo/Command";
import { UndoRedoManager } from "../undo/UndoRedoManager";
import { generateColorFromId } from "../utils/color";
import { CoordinateSystem2D } from "./CoordinateSystem2D";
import {
  OVERLAY_STATUS_ERROR,
  OVERLAY_STATUS_PAINTED,
  OVERLAY_STATUS_PAINTING,
  OVERLAY_STATUS_PENDING,
  RenderingStateManager,
} from "./RenderingStateManager";
import type { Scene2DConfig } from "./SceneConfig";

/**
 * 2D scene that manages overlays, rendering, selection, coordinate system, and undo/redo operations.
 */
export class Scene2D {
  private overlays = new Map<string, BaseOverlay>();
  private undoRedo = new UndoRedoManager();
  private overlayOrder: string[] = [];
  private renderingState = new RenderingStateManager();
  private interactionManager: InteractionManager;
  private selectionManager: SelectionManager;
  private coordinateSystem: CoordinateSystem;
  private canonicalMedia?: CanonicalMedia;
  private canonicalMediaId?: string;
  private unsubscribeCanonicalMedia?: () => void;

  constructor(private readonly config: Scene2DConfig) {
    this.coordinateSystem = new CoordinateSystem2D();
    this.selectionManager = new SelectionManager(config.eventBus);
    this.interactionManager = new InteractionManager(
      config.canvas,
      config.eventBus,
      this.undoRedo,
      this.selectionManager,
      (id) => this.overlays.get(id)
    );
  }

  // TODO: hook up with fiftyone colorscheme
  private static getStyleFromId(id: string): DrawStyle {
    return {
      strokeStyle: generateColorFromId(id, 70, 50),
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
    const identifier =
      overlay.label && "label" in overlay.label
        ? (overlay.label.label as string)
        : overlay.id;
    const baseStyle = Scene2D.getStyleFromId(identifier);

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

  private isSelectable(
    overlay: BaseOverlay
  ): overlay is BaseOverlay & Selectable {
    return "isSelected" in overlay && "setSelected" in overlay;
  }

  private isSpatial(overlay: BaseOverlay): overlay is BaseOverlay & Spatial {
    return "getRelativeBounds" in overlay && "setAbsoluteBounds" in overlay;
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

    // Check if overlay is spatial and track separately
    if (this.isSpatial(overlay)) {
      // Update coordinates if canonical media is set
      if (this.canonicalMedia) {
        this.updateSpatialOverlayCoordinates(overlay);
      }
    }

    if (overlay.id === this.canonicalMediaId) {
      this.overlayOrder.unshift(overlay.id);
    } else {
      this.overlayOrder.push(overlay.id);
    }

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

    // Clean up canonical media subscription
    if (this.unsubscribeCanonicalMedia) {
      this.unsubscribeCanonicalMedia();
      this.unsubscribeCanonicalMedia = undefined;
    }

    // Destroy canonical media if it has a destroy method
    if (this.canonicalMedia && "destroy" in this.canonicalMedia) {
      (this.canonicalMedia as any).destroy();
    }
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
   * Sets the canonical media overlay for coordinate transformations.
   * @param overlayOrMedia - The overlay or CanonicalMedia instance to set as canonical media.
   */
  setCanonicalMedia(overlayOrMedia: BaseOverlay & CanonicalMedia): void {
    // Clean up previous subscription
    if (this.unsubscribeCanonicalMedia) {
      this.unsubscribeCanonicalMedia();
      this.unsubscribeCanonicalMedia = undefined;
    }

    if ("getRenderedBounds" in overlayOrMedia) {
      // It's an overlay that implements CanonicalMedia
      const overlay = overlayOrMedia as BaseOverlay & CanonicalMedia;
      this.canonicalMedia = overlay;
      this.canonicalMediaId = overlay.id;

      // Ensure the canonical media overlay is rendered first
      this.ensureCanonicalMediaInBackground(overlay.id);
    } else {
      // It's a regular overlay that doesn't implement CanonicalMedia
      throw new Error(
        "Overlay must implement CanonicalMedia interface to be set as canonical media"
      );
    }

    // Set up bounds change listener
    this.unsubscribeCanonicalMedia = this.canonicalMedia.onBoundsChanged(
      (bounds) => {
        this.coordinateSystem.updateTransform(bounds);

        // Update all spatial overlays
        this.updateAllSpatialOverlays();
      }
    );

    // Emit event for coordinate transformation updates
    this.config.eventBus.emit({
      type: LIGHTER_EVENTS.CANONICAL_MEDIA_CHANGED,
      detail: { overlayId: this.canonicalMediaId || "custom" },
    });
  }

  /**
   * Ensures the canonical media overlay is at the beginning of the rendering order.
   * @param overlayId - The ID of the canonical media overlay.
   */
  private ensureCanonicalMediaInBackground(overlayId: string): void {
    // Remove the overlay from its current position in the order
    this.overlayOrder = this.overlayOrder.filter((id) => id !== overlayId);

    // Add it to the beginning (background)
    this.overlayOrder.unshift(overlayId);
  }

  /**
   * Gets the canonical media.
   * @returns The canonical media, or undefined if not set.
   */
  getCanonicalMedia(): CanonicalMedia | undefined {
    return this.canonicalMedia;
  }

  /**
   * Gets the canonical media ID.
   * @returns The canonical media overlay ID, or undefined if not set.
   */
  getCanonicalMediaId(): string | undefined {
    return this.canonicalMediaId;
  }

  /**
   * Converts relative coordinates to absolute coordinates based on canonical media.
   * Uses the new coordinate system.
   * @param relativeCoords - Array of relative coordinates [x, y, width, height] in [0,1] range.
   * @returns Absolute coordinates in pixels (canvas space, including offset).
   */
  convertRelativeToAbsolute(relativeCoords: [number, number, number, number]): {
    x: number;
    y: number;
    width: number;
    height: number;
  } {
    const [relativeX, relativeY, relativeWidth, relativeHeight] =
      relativeCoords;
    return this.coordinateSystem.relativeToAbsolute({
      x: relativeX,
      y: relativeY,
      width: relativeWidth,
      height: relativeHeight,
    });
  }

  /**
   * Updates coordinates for all spatial overlays.
   */
  private updateAllSpatialOverlays(): void {
    for (const overlay of this.overlays.values()) {
      if (this.isSpatial(overlay)) {
        this.updateSpatialOverlayCoordinates(overlay);
      }
    }
  }

  /**
   * Updates coordinates for a single spatial overlay.
   */
  private updateSpatialOverlayCoordinates(
    overlay: BaseOverlay & Spatial
  ): void {
    const relativeBounds = overlay.getRelativeBounds();
    const absoluteBounds =
      this.coordinateSystem.relativeToAbsolute(relativeBounds);
    overlay.setAbsoluteBounds(absoluteBounds);
  }

  /**
   * Updates relative bounds for a spatial overlay based on its current absolute bounds.
   * This is used when an overlay's position is changed and we need to update its relative coordinates.
   * @param overlay - The spatial overlay to update.
   */
  private updateSpatialOverlayRelativeBounds(
    overlay: BaseOverlay & Spatial
  ): void {
    const absoluteBounds = overlay.getAbsoluteBounds();
    const relativeBounds =
      this.coordinateSystem.absoluteToRelative(absoluteBounds);

    // Update the overlays relative bounds
    overlay.setRelativeBounds(relativeBounds);
  }

  /**
   * Gets the container dimensions.
   * @returns The container dimensions, or undefined if not available.
   */
  getContainerDimensions(): { width: number; height: number } | undefined {
    return this.config.renderer.getContainerDimensions();
  }

  /**
   * Renders a single frame.
   */
  private renderFrame(): void {
    // Before rendering, update relative bounds for overlays that need it
    for (const overlay of this.overlays.values()) {
      if (this.isSpatial(overlay) && overlay.needsCoordinateUpdate()) {
        this.updateSpatialOverlayRelativeBounds(overlay);
        // Mark coordinate update as complete
        overlay.markCoordinateUpdateComplete();
      }
    }
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

    if (overlay && this.shouldRenderOverlay(overlay, status)) {
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

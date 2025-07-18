/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { EventBus, LIGHTER_EVENTS, type LighterEvent } from "../event/EventBus";
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
import type { Scene2DConfig, SceneOptions } from "./SceneConfig";

/**
 * 2D scene that manages overlays, rendering, selection, coordinate system, and undo/redo operations.
 */
export class Scene2D {
  // Canonical media is the overlay that is used to define the coordinate system
  private canonicalMedia?: CanonicalMedia;
  private canonicalMediaId?: string;
  private coordinateSystem: CoordinateSystem;
  private interactionManager: InteractionManager;
  private overlays = new Map<string, BaseOverlay>();
  private overlayOrder: string[] = [];
  private renderingState = new RenderingStateManager();
  private sceneOptions?: SceneOptions;
  private selectionManager: SelectionManager;
  private undoRedo = new UndoRedoManager();
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
    this.sceneOptions = config.options;

    // Listen for scene options changes to trigger re-rendering
    config.eventBus.on(LIGHTER_EVENTS.SCENE_OPTIONS_CHANGED, (event) => {
      console.log("SCENE_OPTIONS_CHANGED", event);
      const { activePaths, showOverlays, alpha } = event.detail;
      this.updateOptions({ activePaths, showOverlays, alpha });

      // Mark all overlays as dirty to trigger re-rendering
      this.overlays.forEach((overlay) => {
        overlay.markDirty();
      });
    });
  }

  /**
   * Updates the scene options and recalculates overlay order if needed.
   * @param options - The new scene options.
   */
  updateOptions(options: SceneOptions): void {
    this.sceneOptions = options;
    this.recalculateOverlayOrder();
  }

  /**
   * Recalculates the overlay rendering order based on activePaths.
   * This implements the same z-ordering logic as the legacy looker system.
   */
  private recalculateOverlayOrder(): void {
    const { activePaths } = this.sceneOptions || {};

    if (!activePaths || activePaths.length === 0) {
      // If no activePaths, maintain current order but ensure canonical media is first
      this.overlayOrder = this.overlayOrder.filter((id) =>
        this.overlays.has(id)
      );
      if (
        this.canonicalMediaId &&
        this.overlayOrder.includes(this.canonicalMediaId)
      ) {
        this.overlayOrder = [
          this.canonicalMediaId,
          ...this.overlayOrder.filter((id) => id !== this.canonicalMediaId),
        ];
      }
      return;
    }

    // Create bins for each active field (same as legacy looker)
    const bins: Record<string, string[]> = {};
    activePaths.forEach((path) => {
      bins[path] = [];
    });

    // Group overlays by their field
    this.overlays.forEach((overlay, id) => {
      if (overlay.field && bins[overlay.field]) {
        bins[overlay.field].push(id);
      }
    });

    // Build ordered array based on activePaths sequence
    const ordered: string[] = [];

    // Always put canonical media first if it exists
    if (this.canonicalMediaId && this.overlays.has(this.canonicalMediaId)) {
      ordered.push(this.canonicalMediaId);
    }

    // Add overlays in activePaths order
    activePaths.forEach((path) => {
      if (bins[path]) {
        ordered.push(...bins[path]);
      }
    });

    // Add any remaining overlays that don't have a field or aren't in activePaths
    this.overlays.forEach((overlay, id) => {
      if (!ordered.includes(id)) {
        ordered.push(id);
      }
    });

    this.overlayOrder = ordered;
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

    // Apply alpha from scene options if available
    const finalStyle: DrawStyle = {
      ...baseStyle,
      opacity: this.sceneOptions?.alpha ?? baseStyle.opacity,
    };

    // Check if overlay is selectable and selected
    if (this.typeGuards.isSelectable(overlay) && overlay.isSelected()) {
      return {
        ...finalStyle,
        isSelected: true,
        dashPattern: [5, 5], // Dashed pattern for selected overlays
        selectionColor: "#ff6600", // Orange selection color
      };
    }

    return finalStyle;
  }

  private readonly typeGuards = {
    isSelectable: (overlay: BaseOverlay): overlay is BaseOverlay & Selectable =>
      "isSelected" in overlay && "setSelected" in overlay,

    isSpatial: (overlay: BaseOverlay): overlay is BaseOverlay & Spatial =>
      "getRelativeBounds" in overlay && "setAbsoluteBounds" in overlay,
  };

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
    overlay.attachEventBus(this.config.eventBus);
    overlay.setResourceLoader(this.config.resourceLoader);

    // Add to internal tracking
    this.overlays.set(overlay.id, overlay);

    // Update coordinates if spatial and canonical media is set
    if (this.typeGuards.isSpatial(overlay) && this.canonicalMedia) {
      this.updateSpatialOverlayCoordinates(overlay);
    }

    // Recalculate overlay order to maintain proper z-ordering
    this.recalculateOverlayOrder();

    // Register with managers
    this.interactionManager.addHandler(overlay);
    if (this.typeGuards.isSelectable(overlay)) {
      this.selectionManager.addSelectable(overlay);
    }

    this.dispatch({
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
    this.dispatch({
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
   * Dispatches an event through the scene's event bus.
   * This provides a cleaner API than scene.getEventBus().emit().
   * @param event - The event to dispatch.
   */
  dispatch(event: LighterEvent): void {
    this.config.eventBus.emit(event);
  }

  /**
   * Executes a command and adds it to the undo stack.
   * @param command - The command to execute.
   */
  executeCommand(command: Command): void {
    command.execute();
    this.undoRedo.push(command);

    // Emit undo/redo event
    this.dispatch({
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
      this.dispatch({
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
      this.dispatch({
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
    // Remove all overlays
    for (const overlay of this.overlays.values()) {
      this.interactionManager.removeHandler(overlay);
      overlay.destroy();
    }

    this.overlays.clear();
    this.overlayOrder = [];
    this.renderingState.clearAll();
    this.selectionManager.clearSelection();

    // Emit clear event
    this.dispatch({
      type: LIGHTER_EVENTS.SELECTION_CLEARED,
      detail: { previouslySelectedIds: [] },
    });
  }

  /**
   * Destroys the scene and cleans up resources.
   */
  destroy(): void {
    // Clear all overlays
    this.clear();

    // Clean up canonical media subscription
    if (this.unsubscribeCanonicalMedia) {
      this.unsubscribeCanonicalMedia();
    }

    // Destroy managers
    this.interactionManager.destroy();
    this.selectionManager.destroy();
    this.undoRedo.clear();

    // Stop render loop
    this.config.renderer.stopRenderLoop();
  }

  /**
   * Gets the selection manager.
   * @returns The selection manager.
   */
  getSelectionManager(): SelectionManager {
    return this.selectionManager;
  }

  /**
   * Selects an overlay.
   * @param id - The overlay ID to select.
   * @param addToSelection - Whether to add to existing selection.
   */
  selectOverlay(id: string, addToSelection = false): void {
    this.selectionManager.select(id, addToSelection);
  }

  /**
   * Deselects an overlay.
   * @param id - The overlay ID to deselect.
   */
  deselectOverlay(id: string): void {
    this.selectionManager.deselect(id);
  }

  /**
   * Toggles the selection of an overlay.
   * @param id - The overlay ID to toggle.
   * @param addToSelection - Whether to add to existing selection.
   * @returns True if the overlay is now selected.
   */
  toggleOverlaySelection(id: string, addToSelection = false): boolean {
    return this.selectionManager.toggle(id, addToSelection);
  }

  /**
   * Clears the current selection.
   */
  clearSelection(): void {
    this.selectionManager.clearSelection();
  }

  /**
   * Gets the IDs of selected overlays.
   * @returns Array of selected overlay IDs.
   */
  getSelectedOverlayIds(): string[] {
    return this.selectionManager.getSelectedIds();
  }

  /**
   * Gets the selected overlays.
   * @returns Array of selected overlays.
   */
  getSelectedOverlays(): BaseOverlay[] {
    return this.selectionManager
      .getSelectedIds()
      .map((id) => this.overlays.get(id)!)
      .filter(Boolean);
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
   * Sets the canonical media overlay.
   * @param overlayOrMedia - The overlay that represents the canonical media.
   */
  setCanonicalMedia(overlayOrMedia: BaseOverlay & CanonicalMedia): void {
    this.canonicalMedia = overlayOrMedia;
    this.canonicalMediaId = overlayOrMedia.id;

    // Ensure canonical media is in the background
    this.ensureCanonicalMediaInBackground(overlayOrMedia.id);

    // Set up bounds change listener for coordinate system updates
    this.unsubscribeCanonicalMedia = overlayOrMedia.onBoundsChanged(
      (bounds) => {
        this.coordinateSystem.updateTransform(bounds);

        // Update all spatial overlays
        this.updateAllSpatialOverlays();
      }
    );

    // Emit event for coordinate transformation updates
    this.dispatch({
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
      if (this.typeGuards.isSpatial(overlay)) {
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
      if (
        this.typeGuards.isSpatial(overlay) &&
        overlay.needsCoordinateUpdate()
      ) {
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

    if (!overlay) {
      return;
    }

    const status = this.renderingState.getStatus(overlayId);

    if (overlay && this.shouldRenderOverlay(overlay, status)) {
      this.executeOverlayRender(overlayId, overlay);
    }

    if (this.shouldShowOverlay(overlay)) {
      this.config.renderer.show(overlayId);
    } else {
      this.config.renderer.hide(overlayId);
    }
  }

  /**
   * Determines if an overlay should be (re)rendered.
   * Doesn't account for whether the overlay should be shown,
   * which is handled in shouldShowOverlay and depends on activePaths.
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
   * Determines if an overlay should be shown based on scene options.
   * @param overlay - The overlay to check.
   * @returns True if the overlay should be shown.
   */
  private shouldShowOverlay(overlay: BaseOverlay | undefined): boolean {
    // We always show the canonical media
    if (overlay?.id === this.canonicalMediaId) {
      return true;
    }

    if (!overlay || this.sceneOptions?.showOverlays === false) {
      return false;
    }

    // Check if overlay's field is in activePaths
    if (this.sceneOptions?.activePaths && overlay.field) {
      if (this.sceneOptions.activePaths.includes(overlay.field)) {
        return true;
      }
    }

    return false;
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

/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { LIGHTER_EVENTS, type LighterEvent } from "../event/EventBus";
import { InteractionManager } from "../interaction/InteractionManager";
import type { BaseOverlay } from "../overlay/BaseOverlay";
import type { Selectable } from "../selection/Selectable";
import type { SelectionOptions } from "../selection/SelectionManager";
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
import type { ColorMappingContext } from "../utils/colorMapping";
import { getOverlayColor } from "../utils/colorMapping";
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
 * Interface for render callbacks that can be registered to run during the render loop.
 */
export interface RenderCallback {
  id: string;
  callback: () => void | Promise<void>;
  phase: "before" | "after";
}

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
  private renderCallbacks = new Map<string, RenderCallback>();
  private colorMappingContext?: ColorMappingContext;

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
   * Updates the color mapping context used for overlay coloring.
   * @param context - The new color mapping context.
   */
  updateColorMappingContext(context: ColorMappingContext): void {
    this.colorMappingContext = context;
  }

  /**
   * Gets the current color mapping context.
   * @returns The current color mapping context or undefined if not set.
   */
  getColorMappingContext(): ColorMappingContext | undefined {
    return this.colorMappingContext;
  }

  /**
   * Gets the canvas element used by this scene.
   *
   * This is a dangerous method that should only be used when you absolutely need the canvas element.
   * @returns The HTMLCanvasElement.
   */
  getCanvasDangerously(): HTMLCanvasElement {
    return this.config.canvas;
  }

  /**
   * Gets the canvas bounding rectangle for coordinate conversion.
   * This is a safer alternative to getCanvas() when you only need the bounds.
   * @returns The DOMRect of the canvas element.
   */
  getCanvasBounds(): DOMRect {
    return this.config.canvas.getBoundingClientRect();
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

  /**
   * Creates a style for an overlay using FiftyOne's color scheme system.
   * @param overlay - The overlay to create a style for.
   * @returns The draw style for the overlay.
   */
  private createOverlayStyle(overlay: BaseOverlay): DrawStyle | null {
    if (overlay.id === this.canonicalMediaId) {
      // we don't have "style" for the canonical media (like, image overlay)
      return null;
    }

    let strokeStyle: string;

    // Use FiftyOne color scheme if available, otherwise fallback to simple ID-based color
    if (this.colorMappingContext) {
      strokeStyle = getOverlayColor(overlay, this.colorMappingContext);
    } else {
      // Fallback to simple ID-based color generation
      const identifier =
        overlay.label && "label" in overlay.label
          ? (overlay.label.label as string)
          : overlay.id;
      strokeStyle = generateColorFromId(identifier, 70, 50);
    }

    const baseStyle: DrawStyle = {
      strokeStyle,
      lineWidth: 2,
      opacity: 1,
    };

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
    this.config.renderer.startRenderLoop(async () => {
      await this.renderFrame();
    });
  }

  /**
   * Registers a callback to be executed during the render loop.
   * @param callback - The callback configuration.
   * @returns A function to unregister the callback.
   */
  registerRenderCallback(
    callback: Omit<RenderCallback, "id"> & { id?: string }
  ): () => void {
    const id = callback.id || `render-callback-${Date.now()}-${Math.random()}`;

    const renderCallback: RenderCallback = {
      id,
      callback: callback.callback,
      phase: callback.phase,
    };

    this.renderCallbacks.set(id, renderCallback);

    // Return unregister function
    return () => this.unregisterRenderCallback(id);
  }

  /**
   * Unregisters a render callback by ID.
   * @param id - The callback ID to unregister.
   */
  unregisterRenderCallback(id: string): void {
    this.renderCallbacks.delete(id);
  }

  /**
   * Executes render callbacks for a specific phase.
   * @param phase - The phase to execute callbacks for.
   */
  private async executeRenderCallbacks(
    phase: "before" | "after"
  ): Promise<void> {
    const callbacks = Array.from(this.renderCallbacks.values()).filter(
      (callback) => callback.phase === phase
    );

    for (const callback of callbacks) {
      try {
        const result = callback.callback();
        if (result instanceof Promise) {
          await result;
        }
      } catch (error) {
        console.error(`Error in render callback ${callback.id}:`, error);
        // Continue with other callbacks even if one fails
      }
    }
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
   * Gets all visible overlays in the scene.
   * @returns Array of visible overlays.
   */
  getVisibleOverlays(): BaseOverlay[] {
    return Array.from(this.overlays.values()).filter((overlay) =>
      this.shouldShowOverlay(overlay)
    );
  }

  /**
   * Gets all visible overlay IDs in the scene.
   * @returns Array of visible overlay IDs.
   */
  getVisibleOverlayIds(): string[] {
    return Array.from(this.overlays.values())
      .filter((overlay) => this.shouldShowOverlay(overlay))
      .map((overlay) => overlay.id);
  }

  /**
   * Gets all visible selectable overlays in the scene.
   * @returns Array of visible selectable overlays.
   */
  getVisibleSelectableOverlays(): BaseOverlay[] {
    return Array.from(this.overlays.values()).filter(
      (overlay) =>
        this.shouldShowOverlay(overlay) && this.typeGuards.isSelectable(overlay)
    );
  }

  /**
   * Gets all visible selectable overlay IDs in the scene.
   * @returns Array of visible selectable overlay IDs.
   */
  getVisibleSelectableOverlayIds(): string[] {
    return this.getVisibleSelectableOverlays().map((overlay) => overlay.id);
  }

  /**
   * Registers an event listener on the scene's event bus.
   *
   * @param type - The event type to listen for.
   * @param listener - The event listener function.
   */
  on(type: LighterEvent["type"], listener: (e: CustomEvent) => void): void {
    this.config.eventBus.on(type, listener);
  }

  /**
   * Removes an event listener from the scene's event bus.
   *
   * @param type - The event type.
   * @param listener - The event listener function.
   */
  off(type: LighterEvent["type"], listener: (e: CustomEvent) => void): void {
    this.config.eventBus.off(type, listener);
  }

  /**
   * Dispatches an event through the scene's event bus.
   *
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
   * Clears all render callbacks.
   */
  clearRenderCallbacks(): void {
    this.renderCallbacks.clear();
  }

  /**
   * Destroys the scene and cleans up resources.
   */
  destroy(): void {
    // Clear all overlays
    this.clear();

    // Clear render callbacks
    this.clearRenderCallbacks();

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
   * @param options - Optional selection options.
   */
  selectOverlay(id: string, options?: SelectionOptions): void {
    this.selectionManager.select(id, options);
  }

  /**
   * Deselects an overlay.
   * @param id - The overlay ID to deselect.
   * @param options - Optional selection options.
   */
  deselectOverlay(id: string, options?: SelectionOptions): void {
    this.selectionManager.deselect(id, options);
  }

  /**
   * Toggles the selection of an overlay.
   * @param id - The overlay ID to toggle.
   * @param options - Optional selection options.
   * @returns True if the overlay is now selected.
   */
  toggleOverlaySelection(id: string, options?: SelectionOptions): boolean {
    return this.selectionManager.toggle(id, options);
  }

  /**
   * Clears the current selection.
   * @param options - Optional selection options.
   */
  clearSelection(options?: SelectionOptions): void {
    this.selectionManager.clearSelection(options);
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
  private async renderFrame(): Promise<void> {
    // Execute before-render callbacks
    await this.executeRenderCallbacks("before");

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

    // Execute after-render callbacks
    await this.executeRenderCallbacks("after");
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
    if (!overlay) return false;
    if (overlay.id === this.canonicalMediaId) return true;
    if (this.sceneOptions?.showOverlays === false) return false;

    const activePaths = this.sceneOptions?.activePaths;
    if (activePaths && overlay.field) {
      return activePaths.includes(overlay.field);
    }

    return true;
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

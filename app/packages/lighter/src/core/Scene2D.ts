/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { AddOverlayCommand } from "../commands/AddOverlayCommand";
import type { Command } from "../commands/Command";
import { Movable } from "../commands/MoveOverlayCommand";
import { RemoveOverlayCommand } from "../commands/RemoveOverlayCommand";
import {
  TransformOverlayCommand,
  type TransformOptions,
} from "../commands/TransformOverlayCommand";
import { UndoRedoManager } from "../commands/UndoRedoManager";
import { STROKE_WIDTH } from "../constants";
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
  Point,
  Spatial,
} from "../types";
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
 * Const enum for point containment levels.
 */
export const enum CONTAINS {
  NONE = 0,
  CONTENT = 1,
  BORDER = 2,
}

/**
 * Interface for overlay ordering state.
 */
export interface OverlayOrderState {
  /** Current pixel coordinates */
  pixelCoordinates?: Point;
  /** Current rotation angle */
  rotate: number;
  /** Whether to only show hovered labels */
  onlyShowHoveredLabel?: boolean;
  /** Whether this is a thumbnail view */
  thumbnail?: boolean;
}

/**
 * Interface for overlay ordering options.
 */
export interface OverlayOrderOptions {
  /** Array of field paths that determine overlay visibility and rendering order */
  activePaths?: string[];
  /** Whether to only show hovered labels */
  onlyShowHoveredLabel?: boolean;
  /** Whether this is a thumbnail view */
  thumbnail?: boolean;
}

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
  private overlayOrderOptions: OverlayOrderOptions = {};
  private rotation: number = 0;

  private abortController = new AbortController();

  public isDestroyed = false;

  constructor(private readonly config: Scene2DConfig) {
    this.coordinateSystem = new CoordinateSystem2D();
    this.selectionManager = new SelectionManager(config.eventBus);
    this.interactionManager = new InteractionManager(
      config.canvas,
      config.eventBus,
      this.undoRedo,
      this.selectionManager,
      config.renderer,
      (id) => this.overlays.get(id)
    );
    this.sceneOptions = config.options;

    // Listen for scene options changes to trigger re-rendering
    config.eventBus.on(
      LIGHTER_EVENTS.SCENE_OPTIONS_CHANGED,
      (event) => {
        const { activePaths, showOverlays, alpha } = event.detail;
        this.updateOptions({ activePaths, showOverlays, alpha });

        this.overlays.forEach((overlay) => {
          overlay.markDirty();
        });
      },
      this.abortController
    );

    // Listen for hover move event to trigger re-rendering of overlays that are currently hovered
    config.eventBus.on(
      LIGHTER_EVENTS.OVERLAY_HOVER_MOVE,
      () => {
        const { containedIds } =
          this.recalculateOverlayOrderForInteractiveOrdering();

        for (const overlayId of this.overlayOrder) {
          if (containedIds.includes(overlayId)) {
            const overlay = this.overlays.get(overlayId);
            if (overlay) {
              overlay.markDirty();
            }
          }
        }
      },
      this.abortController
    );

    // When we exit all overlays, recalculate the overlay order, and repaint all overlays
    // todo: might want to store prev order and diff and only mark diff as dirty
    config.eventBus.on(
      LIGHTER_EVENTS.OVERLAY_ALL_UNHOVER,
      () => {
        this.recalculateOverlayOrder();

        for (const overlayId of this.overlayOrder) {
          const overlay = this.overlays.get(overlayId);
          if (overlay) {
            overlay.markDirty();
          }
        }
      },
      this.abortController
    );

    document.addEventListener("keydown", this.arrowRotateHandler.bind(this), {
      signal: this.abortController.signal,
    });
  }

  /**
   * Handles keyboard events for occluded labels rotation controls.
   * @param event - The keyboard event.
   */
  private arrowRotateHandler(event: KeyboardEvent): void {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      this.rotatePrevious();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      this.rotateNext();
    }
  }

  /**
   * Updates the overlay ordering options.
   * @param options - The new ordering options.
   */
  updateOverlayOrderOptions(options: OverlayOrderOptions): void {
    this.overlayOrderOptions = { ...this.overlayOrderOptions, ...options };
  }

  /**
   * Updates the color mapping context used for overlay coloring.
   * @param context - The new color mapping context.
   */
  updateColorMappingContext(context: ColorMappingContext): void {
    this.colorMappingContext = context;
  }

  /**
   * Handles the case when there are no active paths.
   */
  private reorderOverlaysWithNoActivePaths(overlays: Map<string, BaseOverlay>) {
    const ordered = Array.from(overlays.keys());

    if (this.canonicalMediaId && overlays.has(this.canonicalMediaId)) {
      const filtered = ordered.filter((id) => id !== this.canonicalMediaId);
      this.overlayOrder = [this.canonicalMediaId, ...filtered];
    } else {
      this.overlayOrder = ordered;
    }

    this.interactionManager.reorderHandlers(this.overlayOrder);
  }

  /**
   * Creates bins for each active field.
   */
  private createFieldBins(
    overlays: Map<string, BaseOverlay>,
    activePaths: string[]
  ): Record<string, string[]> {
    const bins: Record<string, string[]> = {};

    // Initialize bins
    activePaths.forEach((path) => {
      bins[path] = [];
    });

    // Group overlays by their field
    overlays.forEach((overlay, id) => {
      if (overlay.field && bins[overlay.field]) {
        bins[overlay.field].push(id);
      }
    });

    return bins;
  }

  /**
   * Builds the initial ordered array based on activePaths sequence.
   */
  private buildInitialOrder(
    bins: Record<string, string[]>,
    activePaths: string[],
    overlays?: Map<string, BaseOverlay>
  ): string[] {
    const ordered: string[] = [];

    // Always put canonical media first if it exists
    if (this.canonicalMediaId && overlays?.has(this.canonicalMediaId)) {
      ordered.push(this.canonicalMediaId);
    }

    // Add overlays in activePaths order
    activePaths.forEach((path) => {
      if (bins[path]) {
        ordered.push(...bins[path]);
      }
    });

    return ordered;
  }

  /**
   * Adds remaining overlays that don't have a field or aren't in activePaths.
   */
  private addRemainingOverlays(
    ordered: string[],
    overlays: Map<string, BaseOverlay>
  ): string[] {
    const result = [...ordered];

    overlays.forEach((overlay, id) => {
      if (!result.includes(id)) {
        result.push(id);
      }
    });

    return result;
  }

  /**
   * Checks if an overlay contains a point.
   */
  private containsPoint(overlay: BaseOverlay, point: Point): CONTAINS {
    return overlay.getContainmentLevel(point);
  }

  /**
   * Gets the distance from an overlay to a mouse point.
   */
  private getMouseDistance(overlay: BaseOverlay, point: Point): number {
    return overlay.getMouseDistance(point);
  }

  /**
   * Applies rotation to overlay ordering.
   * This cycles through overlapping overlays when multiple overlays are at the same point.
   * @param overlays - Array of overlay IDs to rotate.
   * @param rotate - Rotation index (how many positions to shift).
   * @returns Tuple of [rotated overlays, applied rotation].
   */
  private rotateOverlays(
    overlays: string[],
    rotate: number
  ): [string[], number] {
    if (overlays.length === 0) {
      return [overlays, 0];
    }

    // Limit rotation to array length to prevent out-of-bounds
    const limitedRotation = Math.min(rotate, overlays.length - 1);

    // Rotate the array by shifting elements
    const rotated = [
      ...overlays.slice(limitedRotation),
      ...overlays.slice(0, limitedRotation),
    ];

    return [rotated, limitedRotation];
  }

  /**
   * Gets the current color mapping context.
   * @returns The current color mapping context or undefined if not set.
   */
  getColorMappingContext(): ColorMappingContext | undefined {
    return this.colorMappingContext;
  }

  /**
   * Rotates the overlay order forward (next overlay becomes first).
   */
  rotateNext(): void {
    const previousOrder = [...this.overlayOrder];
    this.rotation++;

    this.recalculateOverlayOrder();

    if (this.hasOrderChanged(previousOrder)) {
      this.markOverlaysForRotation();
      this.emitHoverEventForCurrentPosition();
    } else {
      this.rotation--;
    }
  }

  /**
   * Rotates the overlay order backward (previous overlay becomes first).
   */
  rotatePrevious(): void {
    const previousOrder = [...this.overlayOrder];
    this.rotation = Math.max(0, this.rotation - 1);

    this.recalculateOverlayOrder();

    if (this.hasOrderChanged(previousOrder)) {
      this.markOverlaysForRotation();
      this.emitHoverEventForCurrentPosition();
    }
  }

  /**
   * Gets the current rotation index.
   * @returns The current rotation index.
   */
  getRotation(): number {
    return this.rotation;
  }

  /**
   * Emits a hover event for the topmost overlay at the current mouse position.
   * This is called after rotation to ensure the correct overlay is highlighted.
   */
  private emitHoverEventForCurrentPosition(): void {
    const pixelCoordinates = this.interactionManager.getPixelCoordinates();
    if (!pixelCoordinates) {
      return;
    }

    // Find the topmost overlay at the current mouse position
    const topmostOverlay = this.findOverlayAtPoint(pixelCoordinates);

    if (topmostOverlay && topmostOverlay.id !== this.canonicalMediaId) {
      // Emit hover event with the current mouse position
      this.dispatch({
        type: LIGHTER_EVENTS.OVERLAY_HOVER,
        detail: {
          id: topmostOverlay.id,
          point: pixelCoordinates,
        },
      });
    }
  }

  /**
   * Checks if the overlay order has changed compared to a previous order.
   * @param previousOrder - The previous overlay order to compare against.
   * @returns True if the order has changed, false otherwise.
   */
  private hasOrderChanged(previousOrder: string[]): boolean {
    // If lengths are different, order has changed
    if (previousOrder.length !== this.overlayOrder.length) {
      return true;
    }

    // Check if any overlay ID is in a different position
    for (let i = 0; i < previousOrder.length; i++) {
      if (previousOrder[i] !== this.overlayOrder[i]) {
        return true;
      }
    }

    return false;
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
   * Determines if overlay order should be recalculated based on cursor position.
   * Only recalculates if the cursor is over a non-canonical overlay.
   * @returns True if overlay order should be recalculated.
   */
  private shouldRecalculateOverlayOrder(): boolean {
    const pixelCoordinates = this.interactionManager.getPixelCoordinates();
    if (!pixelCoordinates) {
      return false;
    }

    // Find the overlay at the current cursor position
    const overlayAtCursor = this.findOverlayAtPoint(pixelCoordinates);

    // Only recalculate if we're over a non-canonical overlay
    return (
      overlayAtCursor !== undefined &&
      overlayAtCursor.id !== this.canonicalMediaId
    );
  }

  /**
   * Marks overlays that need re-rendering due to rotation changes.
   * Only marks overlays that are under the mouse cursor since rotation only affects those.
   */
  private markOverlaysForRotation(): void {
    const pixelCoordinates = this.interactionManager.getPixelCoordinates();
    if (!pixelCoordinates) {
      return;
    }

    // Only mark overlays that are under the mouse cursor
    for (const overlayId of this.overlayOrder) {
      const overlay = this.overlays.get(overlayId);
      if (overlay && overlay.getContainmentLevel(pixelCoordinates) > 0) {
        overlay.markDirty();
      }
    }
  }

  /**
   * Finds the overlay at the given point.
   * @param point - The point to check.
   * @returns The overlay at the point, or undefined if none found.
   */
  private findOverlayAtPoint(point: Point): BaseOverlay | undefined {
    // Check overlays in reverse order (topmost first)
    for (let i = this.overlayOrder.length - 1; i >= 0; i--) {
      const overlayId = this.overlayOrder[i];
      const overlay = this.overlays.get(overlayId);
      if (overlay && overlay.getContainmentLevel(point) > 0) {
        return overlay;
      }
    }
    return undefined;
  }

  /**
   * Recalculates the overlay rendering order based on activePaths and interactive state.
   */
  private recalculateOverlayOrder() {
    const { activePaths, showOverlays, alpha } = this.sceneOptions || {};
    const pixelCoordinates = this.interactionManager.getPixelCoordinates();

    if (!pixelCoordinates) {
      this.overlayOrder = Array.from(this.overlays.keys());
      this.interactionManager.reorderHandlers(this.overlayOrder);
      return;
    }

    // Update the overlay order options
    this.overlayOrderOptions = {
      activePaths,
      onlyShowHoveredLabel: false, // TODO: Add this option to SceneOptions
      thumbnail: false, // TODO: Add this option to SceneOptions
    };

    // Get current interaction state for ordering
    const orderState: OverlayOrderState = {
      pixelCoordinates,
      rotate: this.rotation,
      onlyShowHoveredLabel: false, // TODO: Add this option to SceneOptions
      thumbnail: false, // TODO: Add this option to SceneOptions
    };

    // Calculate the new order using the overlay order manager
    // Handle case with no active paths
    if (!activePaths || activePaths.length === 0) {
      this.reorderOverlaysWithNoActivePaths(this.overlays);
      return;
    }

    // Create bins for each active field
    const bins = this.createFieldBins(this.overlays, activePaths);

    // Build initial ordered array based on activePaths sequence
    let ordered = this.buildInitialOrder(bins, activePaths, this.overlays);

    // Add remaining overlays that don't have a field or aren't in activePaths
    ordered = this.addRemainingOverlays(ordered, this.overlays);

    let contained = ordered
      .map((id) => this.overlays.get(id))
      .filter((overlay): overlay is BaseOverlay => {
        if (!overlay) return false;
        return this.containsPoint(overlay, pixelCoordinates) > CONTAINS.NONE;
      })
      .map((overlay) => overlay.id);

    // Find overlays that don't contain the mouse point
    // todo: use lodash bifurcate to split into contained and outside
    const outside = ordered.filter((id) => {
      const overlay = this.overlays.get(id);
      if (!overlay) return false;
      return this.containsPoint(overlay, pixelCoordinates) === CONTAINS.NONE;
    });

    // Apply rotation if needed
    let newRotate = orderState.rotate;
    if (orderState.rotate !== 0) {
      [contained, newRotate] = this.rotateOverlays(
        contained,
        orderState.rotate
      );
    }

    // Handle hover-only mode
    if (orderState.onlyShowHoveredLabel) {
      this.overlayOrder = contained.length > 0 ? [contained[0]] : [];
    } else {
      this.overlayOrder = [...contained, ...outside];
    }

    this.interactionManager.reorderHandlers(this.overlayOrder);
  }

  /**
   * Recalculates the overlay rendering order based on activePaths and interactive state.
   *
   * @returns The IDs of overlays that contain the mouse point.
   */
  private recalculateOverlayOrderForInteractiveOrdering(): {
    containedIds: string[];
  } {
    const { activePaths } = this.sceneOptions || {};

    const point = this.interactionManager.getPixelCoordinates();

    if (!point) {
      return {
        containedIds: [],
      };
    }

    // Find overlays that contain the mouse point
    let contained = this.overlayOrder
      .map((id) => this.overlays.get(id))
      .filter((overlay): overlay is BaseOverlay => {
        if (!overlay) return false;
        if (overlay.id === this.canonicalMediaId) return false;
        return (
          this.containsPoint(overlay, { x: point.x, y: point.y }) >
          CONTAINS.NONE
        );
      })
      .sort((a, b) => {
        const distanceA = this.getMouseDistance(a, { x: point.x, y: point.y });
        const distanceB = this.getMouseDistance(b, { x: point.x, y: point.y });

        return distanceB - distanceA;
      })
      .map((overlay) => overlay.id);

    this.overlayOrder = [
      ...contained,
      ...this.overlayOrder.filter((id) => !contained.includes(id)),
    ];

    // Reorder handlers to match the new overlay order
    this.interactionManager.reorderHandlers(this.overlayOrder);

    return {
      containedIds: contained,
    };
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
      lineWidth: STROKE_WIDTH,
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

    isTransformable: (overlay: BaseOverlay): overlay is BaseOverlay & Movable =>
      "getPosition" in overlay &&
      "setPosition" in overlay &&
      "getBounds" in overlay &&
      "setBounds" in overlay,
  };

  public async startRenderLoop(): Promise<void> {
    this.config.renderer.addTickHandler(async () => {
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
   * @param withUndo - Whether to track this operation for undo/redo.
   */
  addOverlay(overlay: BaseOverlay, withUndo: boolean = false): void {
    if (withUndo) {
      const command = new AddOverlayCommand(this, overlay);
      this.executeCommand(command);
      return;
    }

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

    // Register with managers first
    this.interactionManager.addHandler(overlay);
    if (this.typeGuards.isSelectable(overlay)) {
      this.selectionManager.addSelectable(overlay);
    }

    // Recalculate overlay order to maintain proper z-ordering
    this.recalculateOverlayOrder();

    this.dispatch({
      type: LIGHTER_EVENTS.OVERLAY_ADDED,
      detail: { id: overlay.id },
    });
  }

  /**
   * Removes an overlay from the scene.
   * @param id - The ID of the overlay to remove.
   * @param withUndo - Whether to track this operation for undo/redo.
   */
  removeOverlay(id: string, withUndo: boolean = false): void {
    if (withUndo) {
      const overlay = this.overlays.get(id);
      if (overlay) {
        const command = new RemoveOverlayCommand(this, overlay);
        this.executeCommand(command);
        return;
      }
    }
    const overlay = this.overlays.get(id);

    if (overlay) {
      this.interactionManager.removeHandler(overlay);
      this.selectionManager.removeSelectable(id);

      // Dispose the renderer container to actually remove it from the renderer
      this.config.renderer.dispose(id);

      this.overlays.delete(id);
      this.overlayOrder = this.overlayOrder.filter(
        (overlayId) => overlayId !== id
      );
      this.renderingState.clear(id);
    }

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

    // Reorder handlers to match the new overlay order
    this.interactionManager.reorderHandlers(this.overlayOrder);
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
   * Transforms an overlay by moving and/or scaling it.
   * @param id - The overlay ID.
   * @param options - The transformation options.
   * @returns True if the transformation was successful, false otherwise.
   */
  transformOverlay(id: string, options: TransformOptions): boolean {
    const overlay = this.overlays.get(id);
    if (!overlay) {
      console.warn(`Overlay with id ${id} not found`);
      return false;
    }

    // Check if overlay supports transformation
    if (!this.typeGuards.isTransformable(overlay)) {
      console.warn(`Overlay with id ${id} does not support transformation`);
      return false;
    }

    // Get current bounds for undo/redo
    const oldBounds = overlay.getBounds();

    // Calculate new bounds
    let newBounds = { ...oldBounds };

    if (options.bounds) {
      newBounds = { ...options.bounds };
    } else if (options.scale) {
      // Apply scaling to current bounds
      newBounds = {
        x: newBounds.x,
        y: newBounds.y,
        width: newBounds.width * options.scale.x,
        height: newBounds.height * options.scale.y,
      };
    }

    // Create and execute transform command for undo/redo support
    const command = new TransformOverlayCommand(
      overlay,
      id,
      oldBounds,
      newBounds
    );

    this.executeCommand(command);

    return true;
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
  private dispatch(event: LighterEvent): void {
    this.config.eventBus.emit(event);
  }

  /**
   * Dispatches an event through the scene's event bus.
   * Use `executeCommand` instead of this method where possible.
   *
   * @param event - The event to dispatch.
   */
  public dispatch_DANGEROUSLY(event: LighterEvent): void {
    this.dispatch(event);
  }

  /**
   * Executes a command and adds it to the undo stack.
   * @param command - The command to execute.
   * @param isUndoable - Whether the command is undoable.
   */
  executeCommand(command: Command, isUndoable = true): void {
    command.execute();

    if (isUndoable) {
      this.undoRedo.push(command);
    }

    this.dispatch({
      type: LIGHTER_EVENTS.COMMAND_EXECUTED,
      detail: { commandId: command.id, isUndoable },
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

    this.interactionManager.clearHandlers();
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
    if (this.isDestroyed) return;

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

    // Remove event listeners by aborting the abort controller
    this.abortController.abort();

    // Clean up renderer (NOT destroy)
    this.config.renderer.cleanUp();

    this.isDestroyed = true;
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

    this.interactionManager.setCanonicalMediaId(overlayOrMedia.id);

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

    // Reorder handlers to match the new overlay order
    this.interactionManager.reorderHandlers(this.overlayOrder);
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
        overlay.markCoordinateUpdateComplete();

        this.dispatch({
          type: LIGHTER_EVENTS.OVERLAY_BOUNDS_CHANGED,
          detail: {
            id: overlay.id,
            absoluteBounds: overlay.getAbsoluteBounds(),
            relativeBounds: overlay.getRelativeBounds(),
          },
        });
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

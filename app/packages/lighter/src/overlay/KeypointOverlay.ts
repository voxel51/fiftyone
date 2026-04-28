/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { CommandContextManager } from "@fiftyone/commands";
import { MoveKeypointPointCommand } from "../commands/MoveKeypointPointCommand";
import {
  EDGE_THRESHOLD,
  HOVERED_DASH_LENGTH,
  KEYPOINT_HIT_RADIUS,
  KEYPOINT_RADIUS,
  KEYPOINT_SELECTED_RADIUS,
  LABEL_ARCHETYPE_PRIORITY,
  PREVIEW_LINE_OPACITY,
  SELECTED_DASH_LENGTH,
  STROKE_WIDTH,
} from "../constants";
import { CONTAINS } from "../core/Scene2D";
import type { Renderer2D } from "../renderer/Renderer2D";
import type { Selectable } from "../selection/Selectable";
import type {
  DrawStyle,
  Hoverable,
  Point,
  RawLookerLabel,
  Rect,
  RenderMeta,
  Spatial,
} from "../types";
import {
  distance,
  distanceFromLineSegment,
  pointInPolygon,
} from "../utils/geometry";
import { getSimpleStrokeStyles } from "../utils/colorMapping";
import { BaseOverlay } from "./BaseOverlay";
import { NO_BOUNDS } from "./BoundingBoxOverlay";
import { v4 as uuidv4 } from "uuid";

export type KeypointLabel = RawLookerLabel & {
  label: string;
  points: [number, number][];
  confidence?: number[];
};

/**
 * Options for creating a keypoint overlay.
 *
 * The `connections` and `closed` fields control how points relate to each other,
 * making this overlay extensible to many use cases:
 *
 * - No connections: individual points (e.g. positive/negative point selection)
 * - Sequential connections with `closed: true`: polygon / ROI
 * - Skeleton-defined connections: keypoint labels
 */
export interface KeypointOptions {
  id: string;
  label: KeypointLabel;
  field: string;
  /** Edge index paths, e.g. [[0,1,2], [3,4]]. Omit for unconnected points. */
  connections?: number[][];
  /** Whether to auto-close the polygon (connect last point to first). */
  closed?: boolean;
  draggable?: boolean;
  deletable?: boolean;
  selectable?: boolean;
  /**
   * Per-variant style overrides. Points whose variant key is absent from
   * this map (or who have no variant) render with the overlay's currentStyle.
   */
  variantStyles?: Record<string, DrawStyle>;
}

/**
 * Internal per-point metadata.
 */
type KeypointEntry = {
  id: string;
  position: [number, number];
  variant?: string;
};

/**
 * Per-render context passed to {@link KeypointOverlay} render hooks. Lets
 * subclasses extend rendering without recomputing shared state.
 */
export type KeypointRenderContext = {
  style: DrawStyle;
  absPoints: Point[];
  strokeColor: string;
  lineWidth: number;
  isHovered: boolean;
  isSelected: boolean;
  edgeSegments: Array<[Point, Point]>;
};

/**
 * Keypoint overlay implementation with per-point interaction, optional connections,
 * and optional polygon closure.
 *
 * Extensible to many use cases through configuration:
 * - Positive/negative point selection: no connections, no closed
 * - ROI definition: sequential connections, closed
 * - Polygon drawing: sequential connections, closed
 * - Keypoint labels: skeleton-defined connections
 */
export class KeypointOverlay
  extends BaseOverlay<KeypointLabel>
  implements Selectable, Spatial, Hoverable
{
  private isDraggable: boolean;
  private isDeletable: boolean;
  private isSelectable: boolean;
  private connections: number[][];
  private closed: boolean;
  private readonly variantStyles: Record<string, DrawStyle>;
  private isSelectedState = false;

  #points: KeypointEntry[];

  // Per-point sub-selection
  private selectedPointIndex: number | null = null;

  // Drag state for individual points
  private dragPointIndex: number | null = null;
  private moveStartScreenPoint?: Point;
  private moveStartRelativePoint?: [number, number];

  // Preview point for interactive creation (cursor tracking)
  private previewPoint?: Point | null = null;

  // Caches — invalidated in markDirty()
  private _absPointsCache: Point[] | null = null;
  private _boundsCache: Rect | null = null;
  private _boundsCachedScale: number | null = null;
  private _relativeBoundsCache: Rect | null = null;

  public cursor = "pointer";

  constructor(options: KeypointOptions) {
    super(options.id, options.field, options.label);
    this.#points = (options.label?.points ?? []).map((p) => ({
      id: uuidv4(),
      position: [...p] as [number, number],
    }));
    this.connections = options.connections ?? [];
    this.closed = options.closed ?? false;
    this.variantStyles = options.variantStyles ?? {};
    this.isDraggable = options.draggable !== false;
    this.isDeletable = options.deletable !== false;
    this.isSelectable = options.selectable !== false;
  }

  getOverlayType(): string {
    return "KeypointOverlay";
  }

  // ---------------------------------------------------------------------------
  // Coordinate helpers
  // ---------------------------------------------------------------------------

  relativePointToAbsolute(rp: [number, number]): Point {
    const t = this.getCoordinateSystem().getTransform();
    return {
      x: t.offsetX + rp[0] * t.scaleX,
      y: t.offsetY + rp[1] * t.scaleY,
    };
  }

  absolutePointToRelative(ap: Point): [number, number] {
    const t = this.getCoordinateSystem().getTransform();
    return [(ap.x - t.offsetX) / t.scaleX, (ap.y - t.offsetY) / t.scaleY];
  }

  private getAbsolutePoints(): Point[] {
    if (this._absPointsCache) return this._absPointsCache;
    this._absPointsCache = this.#points.map((e) =>
      this.relativePointToAbsolute(e.position)
    );
    return this._absPointsCache;
  }

  override markDirty(): void {
    this._absPointsCache = null;
    this._boundsCache = null;
    this._boundsCachedScale = null;
    this._relativeBoundsCache = null;
    super.markDirty();
  }

  private getCoordinateSystem() {
    if (!this.coordinateSystem) {
      throw new Error("no coordinate system");
    }
    return this.coordinateSystem;
  }

  // ---------------------------------------------------------------------------
  // Spatial interface
  // ---------------------------------------------------------------------------

  get bounds(): Rect {
    if (this.#points.length === 0) return NO_BOUNDS;

    const currentScale = this.renderer?.getScale() ?? 1;

    // Invalidate cache when scale changes (pad is scale-dependent)
    if (this._boundsCache && this._boundsCachedScale === currentScale) {
      return this._boundsCache;
    }

    const pts = this.getAbsolutePoints();
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    const pad = KEYPOINT_HIT_RADIUS / currentScale;
    this._boundsCache = {
      x: minX - pad,
      y: minY - pad,
      width: maxX - minX + pad * 2,
      height: maxY - minY + pad * 2,
    };
    this._boundsCachedScale = currentScale;
    return this._boundsCache;
  }

  set bounds(_bounds: Rect | undefined) {
    // Keypoint bounds are derived from points, not set directly.
    // This no-op setter exists to satisfy the Spatial interface.
    // To reposition points, mutate them individually via movePoint/addPoint/removePoint.
    if (_bounds) {
      console.warn(
        `KeypointOverlay(${this.id}): setting bounds directly is a no-op; mutate points instead.`
      );
    }
    this.markDirty();
  }

  get relativeBounds(): Rect {
    if (this.#points.length === 0) return NO_BOUNDS;
    if (this._relativeBoundsCache) return this._relativeBoundsCache;

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    for (const p of this.#points) {
      if (p.position[0] < minX) minX = p.position[0];
      if (p.position[0] > maxX) maxX = p.position[0];
      if (p.position[1] < minY) minY = p.position[1];
      if (p.position[1] > maxY) maxY = p.position[1];
    }

    this._relativeBoundsCache = {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
    return this._relativeBoundsCache;
  }

  isDragging(): boolean {
    return this.dragPointIndex !== null;
  }

  isResizing(): boolean {
    return false;
  }

  isMoving(): boolean {
    return this.dragPointIndex !== null;
  }

  hasValidBounds(): boolean {
    return this.#points.length > 0;
  }

  /**
   * Collects edge segments from connections with bounds-checked indices.
   */
  private collectEdgeSegments(absPoints: Point[]): Array<[Point, Point]> {
    const segments: Array<[Point, Point]> = [];
    const len = absPoints.length;
    for (const path of this.connections) {
      for (let i = 1; i < path.length; i++) {
        const fromIdx = path[i - 1];
        const toIdx = path[i];
        if (fromIdx >= 0 && fromIdx < len && toIdx >= 0 && toIdx < len) {
          segments.push([absPoints[fromIdx], absPoints[toIdx]]);
        }
      }

      if (this.closed && path.length > 2) {
        const firstIdx = path[0];
        const lastIdx = path[path.length - 1];
        if (firstIdx >= 0 && firstIdx < len && lastIdx >= 0 && lastIdx < len) {
          segments.push([absPoints[lastIdx], absPoints[firstIdx]]);
        }
      }
    }
    return segments;
  }
  // ---------------------------------------------------------------------------

  protected renderImpl(renderer: Renderer2D, _renderMeta: RenderMeta): void {
    renderer.dispose(this.containerId);

    const style = this.currentStyle;
    if (!style) return;

    const absPoints = this.getAbsolutePoints();
    const ctx: KeypointRenderContext = {
      style,
      absPoints,
      strokeColor: style.strokeStyle || "#ffffff",
      lineWidth: style.lineWidth || STROKE_WIDTH,
      isHovered: this.isHoveredState,
      isSelected: this.isSelectedState,
      edgeSegments: this.collectEdgeSegments(absPoints),
    };

    this.renderFill(renderer, ctx);
    this.renderEdges(renderer, ctx);
    this.renderPreviewLine(renderer, ctx);
    this.renderPoints(renderer, ctx);
    this.renderLabelText(renderer, ctx);

    this.emitLoaded();
  }

  /**
   * Hook for filled rendering beneath edges/points. Default: no-op.
   * Subclasses (e.g. PolylineOverlay) override to draw filled segments.
   */
  protected renderFill(
    _renderer: Renderer2D,
    _ctx: KeypointRenderContext
  ): void {
    // intentionally empty
  }

  protected renderEdges(
    renderer: Renderer2D,
    ctx: KeypointRenderContext
  ): void {
    if (ctx.edgeSegments.length === 0) return;

    renderer.drawLines(
      ctx.edgeSegments,
      { strokeStyle: ctx.strokeColor, lineWidth: ctx.lineWidth },
      this.containerId
    );

    // Dashed overlay when hovered or selected, mirroring BoundingBoxOverlay.
    if (!ctx.isHovered && !ctx.isSelected) return;

    const { overlayStrokeColor, overlayDash } = getSimpleStrokeStyles({
      isSelected: ctx.isSelected,
      strokeColor: ctx.strokeColor,
      isHovered: ctx.isHovered,
      dashLength: ctx.isSelected ? SELECTED_DASH_LENGTH : HOVERED_DASH_LENGTH,
    });

    if (overlayStrokeColor && overlayDash) {
      renderer.drawLines(
        ctx.edgeSegments,
        {
          strokeStyle: overlayStrokeColor,
          lineWidth: ctx.lineWidth,
          dashPattern: [overlayDash, overlayDash],
        },
        this.containerId
      );
    }
  }

  /**
   * Preview line during interactive creation (dashed). Only shown for
   * connected/closed keypoints, not standalone point selection.
   */
  protected renderPreviewLine(
    renderer: Renderer2D,
    ctx: KeypointRenderContext
  ): void {
    if (
      !this.previewPoint ||
      ctx.absPoints.length === 0 ||
      (this.connections.length === 0 && !this.closed)
    ) {
      return;
    }

    const lastPoint = ctx.absPoints[ctx.absPoints.length - 1];
    renderer.drawLine(
      lastPoint,
      this.previewPoint,
      {
        strokeStyle: ctx.strokeColor,
        lineWidth: ctx.lineWidth,
        dashPattern: [6, 4],
        opacity: PREVIEW_LINE_OPACITY,
      },
      this.containerId
    );
  }

  protected renderPoints(
    renderer: Renderer2D,
    ctx: KeypointRenderContext
  ): void {
    const defaultPointStyle: DrawStyle = {
      fillStyle: ctx.strokeColor,
      strokeStyle: "#ffffff",
      lineWidth: ctx.lineWidth,
    };

    const resolvePointStyle = (variant: string | undefined): DrawStyle => {
      const override = variant ? this.variantStyles[variant] : undefined;
      return { ...defaultPointStyle, ...override };
    };

    const buckets = new Map<string | undefined, Point[]>();
    let selectedPoint: Point | undefined;
    let selectedVariant: string | undefined;

    for (let i = 0; i < ctx.absPoints.length; i++) {
      // When hovered, every point renders in its sub-selected state, so
      // there's no need to peel out the explicitly-selected point.
      if (!ctx.isHovered && this.selectedPointIndex === i) {
        selectedPoint = ctx.absPoints[i];
        selectedVariant = this.#points[i].variant;
        continue;
      }
      const v = this.#points[i].variant;
      const bucket = buckets.get(v);
      if (bucket) {
        bucket.push(ctx.absPoints[i]);
      } else {
        buckets.set(v, [ctx.absPoints[i]]);
      }
    }

    const pointRadius = ctx.isHovered
      ? KEYPOINT_SELECTED_RADIUS
      : KEYPOINT_RADIUS;
    for (const [variant, pts] of buckets) {
      const pointStyle = resolvePointStyle(variant);
      renderer.drawPoints(pts, pointRadius, pointStyle, this.containerId);
    }

    // When hovered, overlay an inner white highlight on every point so each
    // vertex matches the sub-selected appearance.
    if (ctx.isHovered) {
      for (const [, pts] of buckets) {
        renderer.drawPoints(
          pts,
          KEYPOINT_RADIUS,
          { fillStyle: "#ffffff" },
          this.containerId
        );
      }
    }

    // Draw selected point at larger radius + inner highlight (separate calls)
    if (selectedPoint) {
      renderer.drawPoint(
        selectedPoint,
        KEYPOINT_SELECTED_RADIUS,
        resolvePointStyle(selectedVariant),
        this.containerId
      );
      renderer.drawPoint(
        selectedPoint,
        KEYPOINT_RADIUS,
        { fillStyle: "#ffffff" },
        this.containerId
      );
    }
  }

  protected renderLabelText(
    renderer: Renderer2D,
    ctx: KeypointRenderContext
  ): void {
    if (!this.label || !this.label.label?.length) return;

    const labelBounds = this.bounds;
    if (!BaseOverlay.validBounds(labelBounds)) return;

    renderer.drawText(
      this.label.label,
      { x: labelBounds.x, y: labelBounds.y },
      {
        fontColor: "#ffffff",
        backgroundColor: ctx.style.fillStyle || ctx.style.strokeStyle || "#000",
      },
      this.containerId
    );
  }

  // ---------------------------------------------------------------------------
  // Hit testing
  // ---------------------------------------------------------------------------

  containsPoint(point: Point): boolean {
    // point is in screen space — convert to world space for distance checks
    const worldPoint = this.renderer?.screenToWorld(point) ?? point;
    return this.getContainmentLevel(worldPoint) !== CONTAINS.NONE;
  }

  getContainmentLevel(point: Point): CONTAINS {
    const scale = this.renderer?.getScale() ?? 1;
    const absPoints = this.getAbsolutePoints();

    // Check proximity to points (highest priority)
    const hitRadius = KEYPOINT_HIT_RADIUS / scale;
    for (const pt of absPoints) {
      if (distance(point.x, point.y, pt.x, pt.y) <= hitRadius) {
        return CONTAINS.BORDER;
      }
    }

    // Check proximity to connection edges
    const edgeThreshold = EDGE_THRESHOLD / scale;
    for (const [from, to] of this.collectEdgeSegments(absPoints)) {
      if (distanceFromLineSegment(point, from, to) <= edgeThreshold) {
        return CONTAINS.CONTENT;
      }
    }

    // For closed polygons, check if point is inside the polygon interior
    if (this.closed && pointInPolygon(point, absPoints)) {
      return CONTAINS.CONTENT;
    }

    return CONTAINS.NONE;
  }

  getMouseDistance(point: Point): number {
    const wp = this.renderer?.screenToWorld(point) ?? point;
    const absPoints = this.getAbsolutePoints();

    // For closed polygons, interior points are direct hits
    if (this.closed && pointInPolygon(wp, absPoints)) {
      return 0;
    }

    let minDist = Number.POSITIVE_INFINITY;

    // Distance to points
    for (const pt of absPoints) {
      const d = distance(wp.x, wp.y, pt.x, pt.y);
      if (d < minDist) minDist = d;
    }

    // Distance to edges
    for (const [from, to] of this.collectEdgeSegments(absPoints)) {
      const d = distanceFromLineSegment(wp, from, to);
      if (d < minDist) minDist = d;
    }

    return minDist;
  }

  // ---------------------------------------------------------------------------
  // Interaction handlers
  // ---------------------------------------------------------------------------

  private findNearestPointIndex(worldPoint: Point, scale: number): number {
    const absPoints = this.getAbsolutePoints();
    const hitRadius = KEYPOINT_HIT_RADIUS / scale;
    let nearestIdx = -1;
    let nearestDist = Number.POSITIVE_INFINITY;

    for (let i = 0; i < absPoints.length; i++) {
      const d = distance(
        worldPoint.x,
        worldPoint.y,
        absPoints[i].x,
        absPoints[i].y
      );
      if (d <= hitRadius && d < nearestDist) {
        nearestDist = d;
        nearestIdx = i;
      }
    }

    return nearestIdx;
  }

  getCursor(worldPoint: Point, scale: number): string {
    if (!this.hasValidBounds()) return "crosshair";
    if (!this.isSelected()) return "pointer";

    const nearestIdx = this.findNearestPointIndex(worldPoint, scale);
    if (nearestIdx >= 0 && this.isDraggable) {
      return this.moveStartScreenPoint ? "grabbing" : "grab";
    }

    return "default";
  }

  onPointerDown(
    point: Point,
    worldPoint: Point,
    _event: PointerEvent,
    scale: number
  ): boolean {
    const nearestIdx = this.findNearestPointIndex(worldPoint, scale);

    if (nearestIdx >= 0) {
      this.selectedPointIndex = nearestIdx;

      if (this.isDraggable) {
        this.dragPointIndex = nearestIdx;
        this.moveStartScreenPoint = point;
        this.moveStartRelativePoint = [...this.#points[nearestIdx].position];
        this.renderer?.disableZoomPan();
      }

      this.markDirty();
      return true;
    }

    // Clicked away from any point — clear sub-selection
    this.selectedPointIndex = null;
    this.markDirty();
    return false;
  }

  onMove(
    _point: Point,
    worldPoint: Point,
    _event: PointerEvent,
    _scale: number
  ): boolean {
    if (
      this.dragPointIndex === null ||
      !this.moveStartScreenPoint ||
      !this.moveStartRelativePoint
    ) {
      return false;
    }

    // Convert world-space cursor position directly to relative coordinates.
    // This avoids double-scaling that would occur from computing a screen-space
    // delta and dividing by both renderer scale and coordinate transform scale.
    this.#points[this.dragPointIndex].position =
      this.absolutePointToRelative(worldPoint);

    this.markDirty();
    return true;
  }

  onPointerUp(_point: Point, _event: PointerEvent): boolean {
    if (this.dragPointIndex === null) return false;

    const movedIdx = this.dragPointIndex;
    const from = this.moveStartRelativePoint;
    const entry = this.#points[movedIdx];
    const to: [number, number] = [entry.position[0], entry.position[1]];

    this.dragPointIndex = null;
    this.moveStartScreenPoint = undefined;
    this.moveStartRelativePoint = undefined;
    this.renderer?.enableZoomPan();

    if (from && (from[0] !== to[0] || from[1] !== to[1])) {
      this.eventBus.dispatch("lighter:keypoint-point-moved", {
        id: this.id,
        pointId: entry.id,
        from: { x: from[0], y: from[1] },
        to: { x: to[0], y: to[1] },
      });

      CommandContextManager.instance()
        .getActiveContext()
        .pushUndoable(new MoveKeypointPointCommand(this, entry.id, from, to));
    }

    return true;
  }

  // ---------------------------------------------------------------------------
  // Public mutation API
  // ---------------------------------------------------------------------------

  /**
   * Adds a point at the given absolute (world) position.
   *
   * @param variant - Optional variant key used to determine render style.
   * @param id - Optional ID. When provided, reuses this id instead of
   *             generating one. Useful when referential integrity is desired.
   * @returns The id of the new point.
   */
  addPoint(worldPoint: Point, variant?: string, id?: string): string {
    const position = this.absolutePointToRelative(worldPoint);
    const entry: KeypointEntry = { id: id ?? uuidv4(), position, variant };
    this.#points.push(entry);

    this.eventBus.dispatch("lighter:keypoint-point-added", {
      id: this.id,
      pointId: entry.id,
      point: { x: position[0], y: position[1] },
      variant,
    });

    this.markDirty();
    return entry.id;
  }

  /**
   * Removes the point with the given ID.
   *
   * @param pointId - The ID of the point to remove
   */
  removePointById(pointId: string): void {
    const index = this.#points.findIndex((p) => p.id === pointId);
    if (index === -1) {
      return;
    }

    this.removePoint(index);
  }

  /**
   * Sets a point's position by ID.
   *
   * @param pointId - ID of the point to move
   * @param to - [x, y] destination coordinates
   */
  movePointById(pointId: string, to: [number, number]): void {
    const entry = this.#points.find((p) => p.id === pointId);
    if (!entry) {
      return;
    }

    const from: [number, number] = entry.position;
    entry.position = [to[0], to[1]];

    this.eventBus.dispatch("lighter:keypoint-point-moved", {
      id: this.id,
      pointId,
      from: { x: from[0], y: from[1] },
      to: { x: to[0], y: to[1] },
    });

    this.markDirty();
  }

  /**
   * Returns the ID of the point at the given absolute (world) position, or
   * null if no point is within hit range.
   *
   * @param worldPoint Point in absolute coordinates
   */
  findPointIdAt(worldPoint: Point): string | null {
    const scale = this.renderer?.getScale() ?? 1;
    const index = this.findNearestPointIndex(worldPoint, scale);
    return index >= 0 ? this.#points[index].id : null;
  }

  /**
   * Returns a snapshot of the point with the given ID, or `null` if none.
   * Returns copies so callers can safely retain the data.
   *
   * @param pointId Point ID
   */
  getPointById(
    pointId: string
  ): { position: [number, number]; variant?: string } | null {
    const entry = this.#points.find((p) => p.id === pointId);
    if (!entry) {
      return null;
    }

    return {
      position: [entry.position[0], entry.position[1]],
      variant: entry.variant,
    };
  }

  /**
   * Removes the point at the given index.
   */
  removePoint(index: number): void {
    if (!this.isDeletable) return;
    if (index < 0 || index >= this.#points.length) return;

    const { id: pointId, variant } = this.#points[index];
    this.#points.splice(index, 1);

    // Update connections: remove references to deleted index, shift higher indices
    this.connections = this.connections
      .map((path) =>
        path.filter((i) => i !== index).map((i) => (i > index ? i - 1 : i))
      )
      .filter((path) => path.length > 1);

    // Clear sub-selection if it was the deleted point
    if (this.selectedPointIndex === index) {
      this.selectedPointIndex = null;
    } else if (
      this.selectedPointIndex !== null &&
      this.selectedPointIndex > index
    ) {
      this.selectedPointIndex--;
    }

    this.eventBus.dispatch("lighter:keypoint-point-deleted", {
      id: this.id,
      pointId,
      variant,
    });

    this.markDirty();
  }

  /**
   * Sets the preview point for interactive creation (dashed line from last point).
   */
  setPreviewPoint(worldPoint: Point | null): void {
    this.previewPoint = worldPoint;
    this.markDirty();
  }

  /**
   * Clears all points from the overlay.
   */
  clearPoints(): void {
    this.#points = [];
    this.selectedPointIndex = null;
    this.dragPointIndex = null;
    this.previewPoint = null;
    this.markDirty();
  }

  /**
   * Returns a copy of the relative points array.
   */
  getRelativePoints(): [number, number][] {
    return this.#points.map((e) => [...e.position] as [number, number]);
  }

  /**
   * Replaces all points with the given relative-coordinate positions, assigning
   * fresh IDs. Bypasses world-coordinate conversion that {@link addPoint} would
   * otherwise apply, so callers can supply already-relative points directly.
   */
  protected setRelativePoints(positions: [number, number][]): void {
    this.#points = positions.map((p) => ({
      id: uuidv4(),
      position: [p[0], p[1]],
    }));
    this.selectedPointIndex = null;
    this.dragPointIndex = null;
    this.previewPoint = null;
    this.markDirty();
  }

  /**
   * Returns the currently sub-selected point index, or null.
   */
  getSelectedPointIndex(): number | null {
    return this.selectedPointIndex;
  }

  /**
   * Updates the connections configuration.
   */
  setConnections(connections: number[][]): void {
    this.connections = connections;
    this.markDirty();
  }

  /**
   * Updates whether the polygon is closed.
   */
  setClosed(closed: boolean): void {
    this.closed = closed;
    this.markDirty();
  }

  // ---------------------------------------------------------------------------
  // Selectable interface
  // ---------------------------------------------------------------------------

  isSelected(): boolean {
    return this.isSelectedState;
  }

  setSelected(selected: boolean): void {
    if (this.isSelectedState !== selected) {
      this.isSelectedState = selected;
      if (!selected) {
        this.selectedPointIndex = null;
      }
      this.markDirty();
    }
  }

  toggleSelected(): boolean {
    this.setSelected(!this.isSelectedState);
    return this.isSelectedState;
  }

  getSelectionPriority(): number {
    return this.isSelectable ? LABEL_ARCHETYPE_PRIORITY.KEYPOINT : -1;
  }

  // ---------------------------------------------------------------------------
  // Hoverable interface
  // ---------------------------------------------------------------------------

  getTooltipInfo(): {
    color: string;
    field: string;
    label: any;
    type: string;
  } | null {
    return {
      color: this.currentStyle?.strokeStyle ?? "#ffffff",
      field: this.field || "unknown",
      label: this.label,
      type: "Keypoint",
    };
  }

  // ---------------------------------------------------------------------------
  // Getters / Setters
  // ---------------------------------------------------------------------------

  getPosition(): Point {
    const b = this.bounds;
    return { x: b.x, y: b.y };
  }

  get containerId(): string {
    return this.id;
  }

  setDraggable(draggable: boolean): void {
    this.isDraggable = draggable;
  }

  getDraggable(): boolean {
    return this.isDraggable;
  }

  setDeletable(deletable: boolean): void {
    this.isDeletable = deletable;
  }

  getDeletable(): boolean {
    return this.isDeletable;
  }
}

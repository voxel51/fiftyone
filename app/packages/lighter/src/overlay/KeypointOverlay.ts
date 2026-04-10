/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  EDGE_THRESHOLD,
  KEYPOINT_HIT_RADIUS,
  KEYPOINT_RADIUS,
  KEYPOINT_SELECTED_RADIUS,
  LABEL_ARCHETYPE_PRIORITY,
  PREVIEW_LINE_OPACITY,
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
import { BaseOverlay } from "./BaseOverlay";
import { NO_BOUNDS } from "./BoundingBoxOverlay";

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
}

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
  private isSelectedState = false;

  #relativePoints: [number, number][];

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
    this.#relativePoints = options.label?.points
      ? options.label.points.map((p) => [...p] as [number, number])
      : [];
    this.connections = options.connections ?? [];
    this.closed = options.closed ?? false;
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

  private relativePointToAbsolute(rp: [number, number]): Point {
    const t = this.getCoordinateSystem().getTransform();
    return {
      x: t.offsetX + rp[0] * t.scaleX,
      y: t.offsetY + rp[1] * t.scaleY,
    };
  }

  private absolutePointToRelative(ap: Point): [number, number] {
    const t = this.getCoordinateSystem().getTransform();
    return [(ap.x - t.offsetX) / t.scaleX, (ap.y - t.offsetY) / t.scaleY];
  }

  private getAbsolutePoints(): Point[] {
    if (this._absPointsCache) return this._absPointsCache;
    this._absPointsCache = this.#relativePoints.map((p) =>
      this.relativePointToAbsolute(p)
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
    if (this.#relativePoints.length === 0) return NO_BOUNDS;

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
    if (this.#relativePoints.length === 0) return NO_BOUNDS;
    if (this._relativeBoundsCache) return this._relativeBoundsCache;

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const p of this.#relativePoints) {
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
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
    return this.#relativePoints.length > 0;
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
    const strokeColor = style.strokeStyle || "#ffffff";
    const lineWidth = style.lineWidth || STROKE_WIDTH;

    // 1. Batch all connection edges into a single draw call
    const edgeSegments = this.collectEdgeSegments(absPoints);

    if (edgeSegments.length > 0) {
      renderer.drawLines(
        edgeSegments,
        { strokeStyle: strokeColor, lineWidth },
        this.containerId
      );
    }

    // 2. Draw preview line (during interactive creation — dashed, separate call)
    //  Only shown for connected/closed keypoints, not standalone point selection.
    if (
      this.previewPoint &&
      absPoints.length > 0 &&
      (this.connections.length > 0 || this.closed)
    ) {
      const lastPoint = absPoints[absPoints.length - 1];
      renderer.drawLine(
        lastPoint,
        this.previewPoint,
        {
          strokeStyle: strokeColor,
          lineWidth,
          dashPattern: [6, 4],
          opacity: PREVIEW_LINE_OPACITY,
        },
        this.containerId
      );
    }

    // 3. Batch all regular points into a single draw call
    const pointStyle: DrawStyle = {
      fillStyle: strokeColor,
      strokeStyle: "#ffffff",
      lineWidth,
    };

    const regularPoints: Point[] = [];
    let selectedPoint: Point | undefined;

    for (let i = 0; i < absPoints.length; i++) {
      if (this.selectedPointIndex === i) {
        selectedPoint = absPoints[i];
      } else {
        regularPoints.push(absPoints[i]);
      }
    }

    if (regularPoints.length > 0) {
      renderer.drawPoints(
        regularPoints,
        KEYPOINT_RADIUS,
        pointStyle,
        this.containerId
      );
    }

    // Draw selected point at larger radius + inner highlight (separate calls)
    if (selectedPoint) {
      renderer.drawPoint(
        selectedPoint,
        KEYPOINT_SELECTED_RADIUS,
        pointStyle,
        this.containerId
      );
      renderer.drawPoint(
        selectedPoint,
        KEYPOINT_RADIUS,
        { fillStyle: "#ffffff" },
        this.containerId
      );
    }

    // 4. Draw label text (reuses cached bounds)
    if (this.label && this.label.label?.length > 0) {
      const labelBounds = this.bounds;
      if (BaseOverlay.validBounds(labelBounds)) {
        renderer.drawText(
          this.label.label,
          { x: labelBounds.x, y: labelBounds.y },
          {
            fontColor: "#ffffff",
            backgroundColor: style.fillStyle || style.strokeStyle || "#000",
          },
          this.containerId
        );
      }
    }

    this.emitLoaded();
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
        this.moveStartRelativePoint = [...this.#relativePoints[nearestIdx]];
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
    this.#relativePoints[this.dragPointIndex] =
      this.absolutePointToRelative(worldPoint);

    this.markDirty();
    return true;
  }

  onPointerUp(_point: Point, _event: PointerEvent): boolean {
    if (this.dragPointIndex === null) return false;

    const movedIdx = this.dragPointIndex;
    const from = this.moveStartRelativePoint;
    const to = this.#relativePoints[movedIdx];

    this.dragPointIndex = null;
    this.moveStartScreenPoint = undefined;
    this.moveStartRelativePoint = undefined;
    this.renderer?.enableZoomPan();

    if (from && to && (from[0] !== to[0] || from[1] !== to[1])) {
      const absPoint = this.relativePointToAbsolute(to);
      this.eventBus.dispatch("lighter:keypoint-point-moved", {
        id: this.id,
        pointIndex: movedIdx,
        worldFrom: this.relativePointToAbsolute(from),
        worldTo: absPoint,
      });
    }

    return true;
  }

  // ---------------------------------------------------------------------------
  // Public mutation API
  // ---------------------------------------------------------------------------

  /**
   * Adds a point at the given absolute (world) position.
   * @returns The index of the new point.
   */
  addPoint(worldPoint: Point): number {
    const rp = this.absolutePointToRelative(worldPoint);
    this.#relativePoints.push(rp);
    const idx = this.#relativePoints.length - 1;

    this.eventBus.dispatch("lighter:keypoint-point-added", {
      id: this.id,
      pointIndex: idx,
      point: { x: rp[0], y: rp[1] },
    });

    this.markDirty();
    return idx;
  }

  /**
   * Removes the point at the given index.
   */
  removePoint(index: number): void {
    if (!this.isDeletable) return;
    if (index < 0 || index >= this.#relativePoints.length) return;

    this.#relativePoints.splice(index, 1);

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
      pointIndex: index,
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
    this.#relativePoints = [];
    this.selectedPointIndex = null;
    this.dragPointIndex = null;
    this.previewPoint = null;
    this.markDirty();
  }

  /**
   * Returns a copy of the relative points array.
   */
  getRelativePoints(): [number, number][] {
    return this.#relativePoints.map((p) => [...p] as [number, number]);
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

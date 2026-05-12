/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  KEYPOINT_RADIUS,
  KEYPOINT_SELECTED_RADIUS,
  PREVIEW_LINE_OPACITY,
  STROKE_WIDTH,
} from "../constants";
import type { Renderer2D } from "../renderer/Renderer2D";
import type { CoordinateSystem, DrawStyle, Point, Rect } from "../types";
import { NO_BOUNDS } from "./DetectionOverlay";
import { KeypointOverlay } from "./KeypointOverlay";
import { v4 as generateUUID } from "uuid";

export interface MaskKeypointsOptions {
  id?: string;
  coordinateSystem: CoordinateSystem;
  renderer: Renderer2D;
  keypointThreshold?: number;
}

const KEYPOINT_THRESHOLD = 25;

/**
 * Extended keypoint overlay for mask pen-tool polygon drawing.
 *
 * Adds:
 * - exposes absolute points
 * - provides bounds without padding
 * - provides a minimum threshold for point distance
 * - `addPoint`: auto-connects all points
 */
export class MaskKeypoints extends KeypointOverlay {
  private lastKeypoint?: Point;
  private keypointThreshold: number;

  constructor(options: MaskKeypointsOptions) {
    super({
      id: options.id ?? generateUUID(),
      label: { label: "", points: [] },
      field: "",
    });

    this.coordinateSystem = options.coordinateSystem;
    this.renderer = options.renderer;
    this.keypointThreshold = options.keypointThreshold ?? KEYPOINT_THRESHOLD;
  }

  /**
   * Returns a copy of points in world space.
   */
  override getAbsolutePoints(): Point[] {
    return super.getAbsolutePoints();
  }

  /**
   * Tight bounds around the points with no padding.
   */
  override get bounds(): Rect {
    const points = this.getAbsolutePoints();
    if (points.length === 0) return NO_BOUNDS;

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    for (const point of points) {
      if (point.x < minX) minX = point.x;
      if (point.x > maxX) maxX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.y > maxY) maxY = point.y;
    }

    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  /**
   * Adds a point and connects it to any prior point.
   *
   * When `options.dragging` is true, throttles placements by `keypointThreshold`
   * to avoid clustering during a drag. Discrete clicks (`dragging` falsy) always
   * place a point so users can manually add points closer than the threshold.
   */
  override addPoint(
    worldPoint: Point,
    options?: { variant?: string; id?: string; dragging?: boolean }
  ): string | null {
    let shouldAddPoint = true;

    if (options?.dragging && this.lastKeypoint) {
      const dist = Math.hypot(
        worldPoint.x - this.lastKeypoint.x,
        worldPoint.y - this.lastKeypoint.y
      );

      shouldAddPoint = dist >= this.keypointThreshold;
    }

    if (shouldAddPoint) {
      const pointID = super.addPoint(worldPoint, options);
      this.rebuildRingConnections();
      this.lastKeypoint = { ...worldPoint };
      return pointID;
    }

    return null;
  }

  /**
   * Removes a point by id and rebuilds the closing-ring connections so the
   * remaining points stay correctly chained.
   */
  override removePointById(pointId: string): void {
    super.removePointById(pointId);
    this.rebuildRingConnections();

    const points = this.getAbsolutePoints();
    this.lastKeypoint = points.length
      ? { x: points[points.length - 1].x, y: points[points.length - 1].y }
      : undefined;
  }

  private rebuildRingConnections(): void {
    const points = this.getAbsolutePoints();
    const connections = points.reduce(
      (memo, _point, index) =>
        index === 0
          ? memo
          : index === points.length - 1
          ? [...memo, [index - 1, index], [index, 0]]
          : [...memo, [index - 1, index]],
      []
    );
    this.setConnections(connections);
  }

  protected override renderImpl(renderer: Renderer2D): void {
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

    // 2. Draw preview lines (during interactive creation — dashed)
    if (this.previewPoint && absPoints.length > 0) {
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

      // a second preview line to the first point
      if (absPoints.length >= 2) {
        const firstPoint = absPoints[0];
        renderer.drawLine(
          firstPoint,
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

    this.emitLoaded();
  }

  override destroy(): void {
    super.destroy();
    this.renderer?.dispose(this.id);
  }
}

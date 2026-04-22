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
import type { DrawStyle, Point, RenderMeta } from "../types";
import { BaseOverlay } from "./BaseOverlay";
import { KeypointOverlay, type KeypointOptions } from "./KeypointOverlay";

export interface MaskKeypointOptions extends KeypointOptions {
  closeConnections?: boolean;
}

/**
 * Extended keypoint overlay for mask pen-tool polygon drawing.
 *
 * Adds:
 * - `closeConnections`: draws a segment connecting the first and last points
 * - `connectToLast` option on `addPoint`: auto-connects sequential points
 * - `preserveContainer` support in rendering (for compositing inside a parent overlay)
 * - Close-connections preview line from the first point to the cursor
 */
export class MaskKeypoints extends KeypointOverlay {
  private closeConnections: boolean;

  constructor(options: MaskKeypointOptions) {
    super(options);
    this.closeConnections = options.closeConnections ?? false;
  }

  /**
   * Returns a copy of points in world space.
   */
  override getAbsolutePoints(): Point[] {
    return super.getAbsolutePoints();
  }

  /**
   * Adds a point at the given absolute (world) position.
   * Optionally connects the new point to the previous one.
   */
  override addPoint(
    worldPoint: Point,
    options: { connectToLast?: boolean } = {}
  ): number {
    const idx = super.addPoint(worldPoint);

    if (options.connectToLast && idx > 0) {
      this.addConnection([idx - 1, idx]);
    }

    return idx;
  }

  /**
   * Adds a new connection to the configuration.
   */
  addConnection(connection: number[]): void {
    this.setConnections([...this.connections, connection]);
  }

  protected override collectEdgeSegments(
    absPoints: Point[]
  ): Array<[Point, Point]> {
    const segments = super.collectEdgeSegments(absPoints);

    if (this.closeConnections && absPoints.length >= 2) {
      segments.push([absPoints[0], absPoints[absPoints.length - 1]]);
    }

    return segments;
  }

  protected override renderImpl(
    renderer: Renderer2D,
    renderMeta: RenderMeta
  ): void {
    // When rendered as a child of another overlay, preserve what has been
    // drawn so far in the shared container.
    if (!renderMeta.preserveContainer) {
      renderer.dispose(this.containerId);
    }

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

      if (this.closeConnections && absPoints.length >= 2) {
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
}

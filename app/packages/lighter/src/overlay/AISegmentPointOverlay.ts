/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Overlay for AI-assisted segmentation prompt points.
 * Renders each point as a green circle with a white "+" cross.
 */

import {
  KEYPOINT_HIT_RADIUS,
  KEYPOINT_RADIUS,
  KEYPOINT_SELECTED_RADIUS,
  STROKE_WIDTH,
} from "../constants";
import type { Renderer2D } from "../renderer/Renderer2D";
import type { Point, RenderMeta } from "../types";
import { BaseOverlay } from "./BaseOverlay";
import { KeypointOverlay, type KeypointOptions } from "./KeypointOverlay";

const POSITIVE_COLOR = "#22c55e"; // green-500
const POSITIVE_SELECTED_COLOR = "#4ade80"; // green-400
const CROSS_COLOR = "#ffffff";
const CROSS_LINE_WIDTH = 2;

/**
 * AI-segment point overlay that renders positive prompt-points as
 * green circles with white "+" crosses.
 *
 * Extends KeypointOverlay for all data management (add/remove/drag/hit-test)
 * but overrides rendering to show the distinctive "+" appearance.
 */
export class AISegmentPointOverlay extends KeypointOverlay {
  constructor(options: Omit<KeypointOptions, "connections" | "closed">) {
    super({ ...options, connections: [], closed: false });
  }

  override getOverlayType(): string {
    return "AISegmentPointOverlay";
  }

  protected override renderImpl(
    renderer: Renderer2D,
    _renderMeta: RenderMeta
  ): void {
    renderer.dispose(this.containerId);

    const absPoints = this.getAbsolutePoints();
    if (absPoints.length === 0) {
      this.emitLoaded();
      return;
    }

    const scale = renderer.getScale() || 1;

    // Draw each point as a green circle with a white "+" cross
    for (let i = 0; i < absPoints.length; i++) {
      const isSelected = this.selectedPointIndex === i;
      const center = absPoints[i];
      const radius = isSelected ? KEYPOINT_SELECTED_RADIUS : KEYPOINT_RADIUS;
      const fillColor = isSelected ? POSITIVE_SELECTED_COLOR : POSITIVE_COLOR;

      // 1. Green filled circle with white border
      renderer.drawPoint(
        center,
        radius,
        {
          fillStyle: fillColor,
          strokeStyle: CROSS_COLOR,
          lineWidth: STROKE_WIDTH,
        },
        this.containerId
      );

      // 2. White "+" cross lines (60% of circle diameter)
      const crossHalf = (radius * 0.6) / scale;
      renderer.drawLine(
        { x: center.x, y: center.y - crossHalf },
        { x: center.x, y: center.y + crossHalf },
        { strokeStyle: CROSS_COLOR, lineWidth: CROSS_LINE_WIDTH },
        this.containerId
      );
      renderer.drawLine(
        { x: center.x - crossHalf, y: center.y },
        { x: center.x + crossHalf, y: center.y },
        { strokeStyle: CROSS_COLOR, lineWidth: CROSS_LINE_WIDTH },
        this.containerId
      );
    }

    // No preview line, no connections, no label text — just points.

    this.emitLoaded();
  }
}

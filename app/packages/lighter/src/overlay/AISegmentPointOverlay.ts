/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Overlay for AI-assisted segmentation prompt points.
 * Renders each point as a green circle with a white "+" cross,
 * with a looping ripple animation while inference is in flight.
 */

import { STROKE_WIDTH } from "../constants";
import type { Renderer2D } from "../renderer/Renderer2D";
import type { Point, RenderMeta } from "../types";
import { KeypointOverlay, type KeypointOptions } from "./KeypointOverlay";

const AI_POINT_RADIUS = 10;
const AI_POINT_SELECTED_RADIUS = 13;
const POSITIVE_COLOR = "#22c55e"; // green-500
const POSITIVE_SELECTED_COLOR = "#4ade80"; // green-400
const CROSS_COLOR = "#ffffff";
const CROSS_LINE_WIDTH = 2.5;

// Ripple animation settings
const RIPPLE_CYCLE_MS = 800; // duration of one ripple cycle
const RIPPLE_MAX_RADIUS = 30;
const RIPPLE_RINGS = 2;

/**
 * AI-segment point overlay that renders positive prompt-points as
 * green circles with white "+" crosses, with a looping ripple animation
 * while inference is processing.
 *
 * Call {@link startProcessing} when inference begins and
 * {@link stopProcessing} when the result arrives.
 */
export class AISegmentPointOverlay extends KeypointOverlay {
  /** Index of the point currently showing a ripple, or null. */
  private processingPointIndex: number | null = null;
  private processingStartTime = 0;
  private animationFrameId: number | null = null;

  constructor(options: Omit<KeypointOptions, "connections" | "closed">) {
    super({ ...options, connections: [], closed: false });
  }

  override getOverlayType(): string {
    return "AISegmentPointOverlay";
  }

  /**
   * No-op: AI segment points are independent — no preview line from
   * the last point to the cursor.
   */
  override setPreviewPoint(_worldPoint: { x: number; y: number } | null): void {
    // intentionally empty
  }

  /**
   * Override addPoint to auto-start processing ripple on the new point.
   */
  override addPoint(worldPoint: Point): number {
    const idx = super.addPoint(worldPoint);
    this.startProcessing(idx);
    return idx;
  }

  /**
   * Start the looping ripple animation on a specific point.
   * Call this when inference begins.
   */
  startProcessing(pointIndex: number): void {
    this.processingPointIndex = pointIndex;
    this.processingStartTime = performance.now();
    this.scheduleAnimation();
  }

  /**
   * Stop the ripple animation.
   * Call this when inference result arrives.
   */
  stopProcessing(): void {
    this.processingPointIndex = null;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.markDirty();
  }

  /**
   * Whether a processing ripple is currently active.
   */
  isProcessing(): boolean {
    return this.processingPointIndex !== null;
  }

  private scheduleAnimation(): void {
    if (this.animationFrameId !== null) return;

    this.animationFrameId = requestAnimationFrame(() => {
      this.animationFrameId = null;
      if (this.processingPointIndex !== null) {
        this.markDirty();
        this.scheduleAnimation();
      }
    });
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

    // 1. Draw looping ripple rings on the processing point
    if (
      this.processingPointIndex !== null &&
      this.processingPointIndex < absPoints.length
    ) {
      const center = absPoints[this.processingPointIndex];
      const elapsed = performance.now() - this.processingStartTime;
      // Loop: progress cycles 0→1 repeatedly
      const cycleProgress = (elapsed % RIPPLE_CYCLE_MS) / RIPPLE_CYCLE_MS;

      for (let ring = 0; ring < RIPPLE_RINGS; ring++) {
        // Stagger each ring
        const ringProgress = (cycleProgress - ring * 0.3 + 1) % 1;
        // Ease-out
        const eased = 1 - Math.pow(1 - ringProgress, 3);
        const rippleRadius =
          (AI_POINT_RADIUS + eased * RIPPLE_MAX_RADIUS) / scale;
        const opacity = (1 - eased) * 0.5;

        if (opacity > 0.01) {
          renderer.drawPoint(
            center,
            rippleRadius * scale, // drawPoint divides by scale internally
            {
              strokeStyle: POSITIVE_COLOR,
              lineWidth: 2,
              opacity,
            },
            this.containerId
          );
        }
      }
    }

    // 2. Draw each point as a green circle with a white "+" cross
    for (let i = 0; i < absPoints.length; i++) {
      const isSelected = this.selectedPointIndex === i;
      const center = absPoints[i];
      const radius = isSelected ? AI_POINT_SELECTED_RADIUS : AI_POINT_RADIUS;
      const fillColor = isSelected ? POSITIVE_SELECTED_COLOR : POSITIVE_COLOR;

      // Green filled circle with white border
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

      // White "+" cross lines (60% of circle diameter)
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

    this.emitLoaded();
  }

  override destroy(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.processingPointIndex = null;
    super.destroy();
  }
}

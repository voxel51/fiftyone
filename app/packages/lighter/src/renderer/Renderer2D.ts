/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type { DrawStyle, Point, Rect, TextOptions } from "../types";

/**
 * 2D renderer interface (merges backend and strategy responsibilities).
 */
export interface Renderer2D {
  // Render loop
  startRenderLoop(onFrame: () => void): void;
  stopRenderLoop(): void;

  // Drawing methods
  drawRect(bounds: Rect, style: DrawStyle): void;
  drawText(text: string, position: Point, options?: TextOptions): void;
  drawLine(start: Point, end: Point, style: DrawStyle): void;
  drawCircle(center: Point, radius: number, style: DrawStyle): void;
  clear(): void;
}

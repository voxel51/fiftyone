/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type { Point2D, BoundingBox, Matrix } from "../types";

/**
 * Base render strategy interface.
 */
export interface RenderStrategy {
  clear(ctx: CanvasRenderingContext2D, bounds?: BoundingBox): void;
  setTransform(ctx: CanvasRenderingContext2D, matrix: Matrix): void;
  resetTransform(ctx: CanvasRenderingContext2D): void;
}

/**
 * 2D render strategy interface.
 */
export interface RenderStrategy2D extends RenderStrategy {
  drawRect(
    ctx: CanvasRenderingContext2D,
    bounds: BoundingBox,
    options?: {
      fillStyle?: string;
      strokeStyle?: string;
      lineWidth?: number;
      lineDash?: number[];
    }
  ): void;

  drawText(
    ctx: CanvasRenderingContext2D,
    text: string,
    position: Point2D,
    options?: {
      font?: string;
      fillStyle?: string;
      strokeStyle?: string;
      textAlign?: CanvasTextAlign;
      textBaseline?: CanvasTextBaseline;
      maxWidth?: number;
    }
  ): void;

  drawLine(
    ctx: CanvasRenderingContext2D,
    from: Point2D,
    to: Point2D,
    options?: {
      strokeStyle?: string;
      lineWidth?: number;
      lineDash?: number[];
    }
  ): void;

  drawCircle(
    ctx: CanvasRenderingContext2D,
    center: Point2D,
    radius: number,
    options?: {
      fillStyle?: string;
      strokeStyle?: string;
      lineWidth?: number;
    }
  ): void;

  drawPath(
    ctx: CanvasRenderingContext2D,
    points: Point2D[],
    options?: {
      fillStyle?: string;
      strokeStyle?: string;
      lineWidth?: number;
      closePath?: boolean;
    }
  ): void;
}

/**
 * 3D render strategy interface (stub).
 */
export interface RenderStrategy3D extends RenderStrategy {
  // 3D methods would go here - stubbed for now
}

/**
 * Default 2D render strategy implementation.
 */
export class DefaultRenderStrategy2D implements RenderStrategy2D {
  clear(ctx: CanvasRenderingContext2D, bounds?: BoundingBox): void {
    if (bounds) {
      ctx.clearRect(bounds.x, bounds.y, bounds.width, bounds.height);
    } else {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
  }

  setTransform(ctx: CanvasRenderingContext2D, matrix: Matrix): void {
    ctx.setTransform(
      matrix.a,
      matrix.b,
      matrix.c,
      matrix.d,
      matrix.e,
      matrix.f
    );
  }

  resetTransform(ctx: CanvasRenderingContext2D): void {
    ctx.resetTransform();
  }

  drawRect(
    ctx: CanvasRenderingContext2D,
    bounds: BoundingBox,
    options: {
      fillStyle?: string;
      strokeStyle?: string;
      lineWidth?: number;
      lineDash?: number[];
    } = {}
  ): void {
    const { fillStyle, strokeStyle, lineWidth = 1, lineDash = [] } = options;

    ctx.save();

    if (lineDash.length > 0) {
      ctx.setLineDash(lineDash);
    }

    if (lineWidth) {
      ctx.lineWidth = lineWidth;
    }

    if (fillStyle) {
      ctx.fillStyle = fillStyle;
      ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    }

    if (strokeStyle) {
      ctx.strokeStyle = strokeStyle;
      ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
    }

    ctx.restore();
  }

  drawText(
    ctx: CanvasRenderingContext2D,
    text: string,
    position: Point2D,
    options: {
      font?: string;
      fillStyle?: string;
      strokeStyle?: string;
      textAlign?: CanvasTextAlign;
      textBaseline?: CanvasTextBaseline;
      maxWidth?: number;
    } = {}
  ): void {
    const { font, fillStyle, strokeStyle, textAlign, textBaseline, maxWidth } =
      options;

    ctx.save();

    if (font) ctx.font = font;
    if (textAlign) ctx.textAlign = textAlign;
    if (textBaseline) ctx.textBaseline = textBaseline;

    if (fillStyle) {
      ctx.fillStyle = fillStyle;
      ctx.fillText(text, position.x, position.y, maxWidth);
    }

    if (strokeStyle) {
      ctx.strokeStyle = strokeStyle;
      ctx.strokeText(text, position.x, position.y, maxWidth);
    }

    ctx.restore();
  }

  drawLine(
    ctx: CanvasRenderingContext2D,
    from: Point2D,
    to: Point2D,
    options: {
      strokeStyle?: string;
      lineWidth?: number;
      lineDash?: number[];
    } = {}
  ): void {
    const { strokeStyle, lineWidth = 1, lineDash = [] } = options;

    ctx.save();
    ctx.beginPath();

    if (strokeStyle) ctx.strokeStyle = strokeStyle;
    if (lineWidth) ctx.lineWidth = lineWidth;
    if (lineDash.length > 0) ctx.setLineDash(lineDash);

    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();

    ctx.restore();
  }

  drawCircle(
    ctx: CanvasRenderingContext2D,
    center: Point2D,
    radius: number,
    options: {
      fillStyle?: string;
      strokeStyle?: string;
      lineWidth?: number;
    } = {}
  ): void {
    const { fillStyle, strokeStyle, lineWidth = 1 } = options;

    ctx.save();
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI);

    if (fillStyle) {
      ctx.fillStyle = fillStyle;
      ctx.fill();
    }

    if (strokeStyle) {
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }

    ctx.restore();
  }

  drawPath(
    ctx: CanvasRenderingContext2D,
    points: Point2D[],
    options: {
      fillStyle?: string;
      strokeStyle?: string;
      lineWidth?: number;
      closePath?: boolean;
    } = {}
  ): void {
    if (points.length === 0) return;

    const {
      fillStyle,
      strokeStyle,
      lineWidth = 1,
      closePath = false,
    } = options;

    ctx.save();
    ctx.beginPath();

    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }

    if (closePath) {
      ctx.closePath();
    }

    if (fillStyle) {
      ctx.fillStyle = fillStyle;
      ctx.fill();
    }

    if (strokeStyle) {
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }

    ctx.restore();
  }
}

/**
 * Stub 3D render strategy - throws "Not implemented".
 */
export class StubRenderStrategy3D implements RenderStrategy3D {
  clear(): void {
    throw new Error("3D rendering not implemented");
  }

  setTransform(): void {
    throw new Error("3D rendering not implemented");
  }

  resetTransform(): void {
    throw new Error("3D rendering not implemented");
  }
}

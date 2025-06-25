/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { BaseOverlay } from "./base";
import type {
  BoundingBox,
  Point2D,
  RenderContext,
  OverlayOptions,
} from "../types";
import type { RenderStrategy2D } from "../rendering/strategies";

/**
 * Options for creating a bounding box overlay.
 */
export interface BoundingBoxOverlayOptions extends OverlayOptions {
  bounds: BoundingBox;
  label?: string;
  confidence?: number;
  strokeColor?: string;
  fillColor?: string;
  lineWidth?: number;
  lineDash?: number[];
  showLabel?: boolean;
  labelBackgroundColor?: string;
  labelTextColor?: string;
}

/**
 * Handle positions for resizing.
 */
export type HandlePosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "top"
  | "right"
  | "bottom"
  | "left";

/**
 * Bounding box overlay with drawing and hit-testing capabilities.
 */
export class BoundingBoxOverlay extends BaseOverlay {
  private bounds: BoundingBox;
  private label: string;
  private confidence?: number;
  private strokeColor: string;
  private fillColor?: string;
  private lineWidth: number;
  private lineDash: number[];
  private showLabel: boolean;
  private labelBackgroundColor: string;
  private labelTextColor: string;
  private isSelected: boolean = false;
  private isHovered: boolean = false;
  private isDragging: boolean = false;
  private isResizing: boolean = false;
  private resizeHandle?: HandlePosition;
  private dragStartPoint?: Point2D;
  private dragStartBounds?: BoundingBox;

  // Handle constants
  private static readonly HANDLE_SIZE = 8;
  private static readonly HANDLE_HALF_SIZE = BoundingBoxOverlay.HANDLE_SIZE / 2;

  constructor(options: BoundingBoxOverlayOptions) {
    super(options.id, options.name, options.tags);

    this.bounds = { ...options.bounds };
    this.label = options.label || "";
    this.confidence = options.confidence;
    this.strokeColor = options.strokeColor || "#00ff00";
    this.fillColor = options.fillColor;
    this.lineWidth = options.lineWidth || 2;
    this.lineDash = options.lineDash || [];
    this.showLabel = options.showLabel ?? true;
    this.labelBackgroundColor =
      options.labelBackgroundColor || "rgba(0, 0, 0, 0.8)";
    this.labelTextColor = options.labelTextColor || "#ffffff";
    this.zIndex = options.zIndex || 0;
  }

  render(ctx: RenderContext): void {
    if (!this.applyRenderSetup(ctx)) {
      return;
    }

    const strategy = this.getRenderStrategy(ctx);

    // Draw the bounding box
    this.drawBoundingBox(strategy, ctx.ctx);

    // Draw label if enabled
    if (this.showLabel && this.label) {
      this.drawLabel(strategy, ctx.ctx);
    }

    // Draw selection handles if selected
    if (this.isSelected) {
      this.drawSelectionHandles(strategy, ctx.ctx);
    }

    this.cleanupRenderSetup(ctx);
  }

  hitTest(point: Point2D): boolean {
    const localPoint = this.transformPointToLocal(point);

    // Check if point is inside the bounding box
    return (
      localPoint.x >= this.bounds.x &&
      localPoint.x <= this.bounds.x + this.bounds.width &&
      localPoint.y >= this.bounds.y &&
      localPoint.y <= this.bounds.y + this.bounds.height
    );
  }

  getBounds(): BoundingBox {
    return { ...this.bounds };
  }

  /**
   * Updates the bounding box bounds.
   */
  setBounds(bounds: BoundingBox): void {
    const previousBounds = { ...this.bounds };
    this.bounds = { ...bounds };
    this.emitUpdateEvent({ bounds }, { bounds: previousBounds });
  }

  /**
   * Updates the label.
   */
  setLabel(label: string): void {
    const previousLabel = this.label;
    this.label = label;
    this.emitUpdateEvent({ label }, { label: previousLabel });
  }

  /**
   * Updates the confidence score.
   */
  setConfidence(confidence: number): void {
    const previousConfidence = this.confidence;
    this.confidence = confidence;
    this.emitUpdateEvent({ confidence }, { confidence: previousConfidence });
  }

  /**
   * Sets the selection state.
   */
  setSelected(selected: boolean): void {
    this.isSelected = selected;
  }

  /**
   * Gets the selection state.
   */
  getSelected(): boolean {
    return this.isSelected;
  }

  /**
   * Sets the hover state.
   */
  setHovered(hovered: boolean): void {
    this.isHovered = hovered;
  }

  /**
   * Gets the hover state.
   */
  getHovered(): boolean {
    return this.isHovered;
  }

  /**
   * Starts a drag operation.
   */
  startDrag(point: Point2D): void {
    this.isDragging = true;
    this.dragStartPoint = this.transformPointToLocal(point);
    this.dragStartBounds = { ...this.bounds };
  }

  /**
   * Updates the drag operation.
   */
  updateDrag(point: Point2D): void {
    if (!this.isDragging || !this.dragStartPoint || !this.dragStartBounds) {
      return;
    }

    const localPoint = this.transformPointToLocal(point);
    const dx = localPoint.x - this.dragStartPoint.x;
    const dy = localPoint.y - this.dragStartPoint.y;

    this.setBounds({
      x: this.dragStartBounds.x + dx,
      y: this.dragStartBounds.y + dy,
      width: this.dragStartBounds.width,
      height: this.dragStartBounds.height,
    });
  }

  /**
   * Ends the drag operation.
   */
  endDrag(): void {
    this.isDragging = false;
    this.dragStartPoint = undefined;
    this.dragStartBounds = undefined;
  }

  /**
   * Tests if a point hits a resize handle.
   */
  hitTestHandle(point: Point2D): HandlePosition | null {
    if (!this.isSelected) {
      return null;
    }

    const localPoint = this.transformPointToLocal(point);
    const handles = this.getHandlePositions();

    for (const [position, handleBounds] of handles) {
      if (this.pointInRect(localPoint, handleBounds)) {
        return position;
      }
    }

    return null;
  }

  /**
   * Starts a resize operation.
   */
  startResize(handle: HandlePosition, point: Point2D): void {
    this.isResizing = true;
    this.resizeHandle = handle;
    this.dragStartPoint = this.transformPointToLocal(point);
    this.dragStartBounds = { ...this.bounds };
  }

  /**
   * Updates the resize operation.
   */
  updateResize(point: Point2D): void {
    if (
      !this.isResizing ||
      !this.resizeHandle ||
      !this.dragStartPoint ||
      !this.dragStartBounds
    ) {
      return;
    }

    const localPoint = this.transformPointToLocal(point);
    const dx = localPoint.x - this.dragStartPoint.x;
    const dy = localPoint.y - this.dragStartPoint.y;

    const newBounds = this.calculateResizedBounds(this.resizeHandle, dx, dy);
    this.setBounds(newBounds);
  }

  /**
   * Ends the resize operation.
   */
  endResize(): void {
    this.isResizing = false;
    this.resizeHandle = undefined;
    this.dragStartPoint = undefined;
    this.dragStartBounds = undefined;
  }

  private getRenderStrategy(ctx: RenderContext): RenderStrategy2D {
    // In a real implementation, this would be injected
    // For now, we'll use the context directly
    return {
      drawRect: (
        renderCtx,
        bounds,
        options: {
          fillStyle?: string;
          strokeStyle?: string;
          lineWidth?: number;
          lineDash?: number[];
        } = {}
      ) => {
        renderCtx.save();
        if (options.lineWidth) renderCtx.lineWidth = options.lineWidth;
        if (options.lineDash) renderCtx.setLineDash(options.lineDash);
        if (options.fillStyle) {
          renderCtx.fillStyle = options.fillStyle;
          renderCtx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
        }
        if (options.strokeStyle) {
          renderCtx.strokeStyle = options.strokeStyle;
          renderCtx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
        }
        renderCtx.restore();
      },
      drawText: (
        renderCtx,
        text,
        position,
        options: {
          font?: string;
          fillStyle?: string;
          strokeStyle?: string;
          textAlign?: CanvasTextAlign;
          textBaseline?: CanvasTextBaseline;
          maxWidth?: number;
        } = {}
      ) => {
        renderCtx.save();
        if (options.font) renderCtx.font = options.font;
        if (options.textAlign) renderCtx.textAlign = options.textAlign;
        if (options.textBaseline) renderCtx.textBaseline = options.textBaseline;
        if (options.fillStyle) {
          renderCtx.fillStyle = options.fillStyle;
          renderCtx.fillText(text, position.x, position.y, options.maxWidth);
        }
        if (options.strokeStyle) {
          renderCtx.strokeStyle = options.strokeStyle;
          renderCtx.strokeText(text, position.x, position.y, options.maxWidth);
        }
        renderCtx.restore();
      },
    } as RenderStrategy2D; // Simplified for this implementation
  }

  private drawBoundingBox(
    strategy: RenderStrategy2D,
    ctx: CanvasRenderingContext2D
  ): void {
    const strokeColor = this.isHovered
      ? this.lightenColor(this.strokeColor)
      : this.strokeColor;

    strategy.drawRect(ctx, this.bounds, {
      strokeStyle: strokeColor,
      lineWidth: this.lineWidth,
      lineDash: this.lineDash,
      fillStyle: this.fillColor,
    });
  }

  private drawLabel(
    strategy: RenderStrategy2D,
    ctx: CanvasRenderingContext2D
  ): void {
    const labelText =
      this.confidence !== undefined
        ? `${this.label} (${(this.confidence * 100).toFixed(1)}%)`
        : this.label;

    // Measure text to create background
    ctx.font = "12px Arial";
    const textMetrics = ctx.measureText(labelText);
    const textWidth = textMetrics.width;
    const textHeight = 14; // Approximate height

    const labelX = this.bounds.x;
    const labelY = this.bounds.y - textHeight - 2;
    const padding = 4;

    // Draw background
    strategy.drawRect(
      ctx,
      {
        x: labelX - padding,
        y: labelY - padding,
        width: textWidth + padding * 2,
        height: textHeight + padding * 2,
      },
      {
        fillStyle: this.labelBackgroundColor,
      }
    );

    // Draw text
    strategy.drawText(
      ctx,
      labelText,
      { x: labelX, y: labelY + textHeight - 2 },
      {
        font: "12px Arial",
        fillStyle: this.labelTextColor,
        textBaseline: "top",
      }
    );
  }

  private drawSelectionHandles(
    strategy: RenderStrategy2D,
    ctx: CanvasRenderingContext2D
  ): void {
    const handles = this.getHandlePositions();

    for (const [, handleBounds] of handles) {
      strategy.drawRect(ctx, handleBounds, {
        fillStyle: "#ffffff",
        strokeStyle: this.strokeColor,
        lineWidth: 1,
      });
    }
  }

  private getHandlePositions(): Map<HandlePosition, BoundingBox> {
    const { x, y, width, height } = this.bounds;
    const size = BoundingBoxOverlay.HANDLE_SIZE;
    const halfSize = BoundingBoxOverlay.HANDLE_HALF_SIZE;

    return new Map([
      [
        "top-left",
        { x: x - halfSize, y: y - halfSize, width: size, height: size },
      ],
      [
        "top-right",
        { x: x + width - halfSize, y: y - halfSize, width: size, height: size },
      ],
      [
        "bottom-left",
        {
          x: x - halfSize,
          y: y + height - halfSize,
          width: size,
          height: size,
        },
      ],
      [
        "bottom-right",
        {
          x: x + width - halfSize,
          y: y + height - halfSize,
          width: size,
          height: size,
        },
      ],
      [
        "top",
        {
          x: x + width / 2 - halfSize,
          y: y - halfSize,
          width: size,
          height: size,
        },
      ],
      [
        "right",
        {
          x: x + width - halfSize,
          y: y + height / 2 - halfSize,
          width: size,
          height: size,
        },
      ],
      [
        "bottom",
        {
          x: x + width / 2 - halfSize,
          y: y + height - halfSize,
          width: size,
          height: size,
        },
      ],
      [
        "left",
        {
          x: x - halfSize,
          y: y + height / 2 - halfSize,
          width: size,
          height: size,
        },
      ],
    ]);
  }

  private pointInRect(point: Point2D, rect: BoundingBox): boolean {
    return (
      point.x >= rect.x &&
      point.x <= rect.x + rect.width &&
      point.y >= rect.y &&
      point.y <= rect.y + rect.height
    );
  }

  private calculateResizedBounds(
    handle: HandlePosition,
    dx: number,
    dy: number
  ): BoundingBox {
    if (!this.dragStartBounds) {
      return this.bounds;
    }

    const { x, y, width, height } = this.dragStartBounds;
    let newX = x,
      newY = y,
      newWidth = width,
      newHeight = height;

    switch (handle) {
      case "top-left":
        newX = x + dx;
        newY = y + dy;
        newWidth = width - dx;
        newHeight = height - dy;
        break;
      case "top-right":
        newY = y + dy;
        newWidth = width + dx;
        newHeight = height - dy;
        break;
      case "bottom-left":
        newX = x + dx;
        newWidth = width - dx;
        newHeight = height + dy;
        break;
      case "bottom-right":
        newWidth = width + dx;
        newHeight = height + dy;
        break;
      case "top":
        newY = y + dy;
        newHeight = height - dy;
        break;
      case "right":
        newWidth = width + dx;
        break;
      case "bottom":
        newHeight = height + dy;
        break;
      case "left":
        newX = x + dx;
        newWidth = width - dx;
        break;
    }

    // Ensure minimum size
    const minSize = 10;
    if (newWidth < minSize) {
      newWidth = minSize;
      if (handle.includes("left")) {
        newX = x + width - minSize;
      }
    }
    if (newHeight < minSize) {
      newHeight = minSize;
      if (handle.includes("top")) {
        newY = y + height - minSize;
      }
    }

    return { x: newX, y: newY, width: newWidth, height: newHeight };
  }

  private lightenColor(color: string): string {
    // Simple color lightening - in a real implementation, use a color library
    if (color.startsWith("#")) {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      return `rgb(${Math.min(255, r + 40)}, ${Math.min(
        255,
        g + 40
      )}, ${Math.min(255, b + 40)})`;
    }
    return color;
  }

  private emitUpdateEvent(
    changes: Record<string, any>,
    previousState: Record<string, any>
  ): void {
    // Event emission would be handled by the scene
    // This is a placeholder for the interface
  }
}

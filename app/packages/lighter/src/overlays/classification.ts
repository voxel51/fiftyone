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
 * Classification label data.
 */
export interface ClassificationLabel {
  id: string;
  label: string;
  confidence: number;
  color?: string;
}

/**
 * Options for creating a classification overlay.
 */
export interface ClassificationOverlayOptions extends OverlayOptions {
  position: Point2D;
  labels: ClassificationLabel[];
  backgroundColor?: string;
  textColor?: string;
  fontSize?: number;
  padding?: number;
  borderRadius?: number;
  showConfidence?: boolean;
  maxWidth?: number;
}

/**
 * Classification overlay for displaying and managing classification labels.
 */
export class ClassificationOverlay extends BaseOverlay {
  private position: Point2D;
  private labels: ClassificationLabel[];
  private backgroundColor: string;
  private textColor: string;
  private fontSize: number;
  private padding: number;
  private borderRadius: number;
  private showConfidence: boolean;
  private maxWidth: number;
  private cachedBounds?: BoundingBox;
  private isHovered: boolean = false;
  private hoveredLabelId?: string;

  constructor(options: ClassificationOverlayOptions) {
    super(options.id, options.name, options.tags);

    this.position = { ...options.position };
    this.labels = [...options.labels];
    this.backgroundColor = options.backgroundColor || "rgba(0, 0, 0, 0.8)";
    this.textColor = options.textColor || "#ffffff";
    this.fontSize = options.fontSize || 12;
    this.padding = options.padding || 8;
    this.borderRadius = options.borderRadius || 4;
    this.showConfidence = options.showConfidence ?? true;
    this.maxWidth = options.maxWidth || 200;
    this.zIndex = options.zIndex || 0;
  }

  render(ctx: RenderContext): void {
    if (!this.applyRenderSetup(ctx)) {
      return;
    }

    if (this.labels.length === 0) {
      this.cleanupRenderSetup(ctx);
      return;
    }

    const strategy = this.getRenderStrategy(ctx);
    this.drawClassificationLabels(strategy, ctx.ctx);
    this.cleanupRenderSetup(ctx);
  }

  hitTest(point: Point2D): boolean {
    const bounds = this.getBounds();
    const localPoint = this.transformPointToLocal(point);

    return (
      localPoint.x >= bounds.x &&
      localPoint.x <= bounds.x + bounds.width &&
      localPoint.y >= bounds.y &&
      localPoint.y <= bounds.y + bounds.height
    );
  }

  getBounds(): BoundingBox {
    if (!this.cachedBounds) {
      this.cachedBounds = this.calculateBounds();
    }
    return { ...this.cachedBounds };
  }

  /**
   * Adds a classification label.
   */
  addLabel(label: ClassificationLabel): void {
    const existingIndex = this.labels.findIndex((l) => l.id === label.id);
    if (existingIndex >= 0) {
      // Update existing label
      const previousLabel = this.labels[existingIndex];
      this.labels[existingIndex] = { ...label };
      this.invalidateBounds();
      this.emitUpdateEvent(
        { labelUpdated: label },
        { labelUpdated: previousLabel }
      );
    } else {
      // Add new label
      this.labels.push({ ...label });
      this.invalidateBounds();
      this.emitUpdateEvent({ labelAdded: label }, {});
    }
  }

  /**
   * Removes a classification label by ID.
   */
  removeLabel(labelId: string): boolean {
    const index = this.labels.findIndex((l) => l.id === labelId);
    if (index >= 0) {
      const removedLabel = this.labels.splice(index, 1)[0];
      this.invalidateBounds();
      this.emitUpdateEvent({ labelRemoved: removedLabel }, {});
      return true;
    }
    return false;
  }

  /**
   * Updates a classification label.
   */
  updateLabel(
    labelId: string,
    updates: Partial<Omit<ClassificationLabel, "id">>
  ): boolean {
    const index = this.labels.findIndex((l) => l.id === labelId);
    if (index >= 0) {
      const previousLabel = { ...this.labels[index] };
      this.labels[index] = { ...this.labels[index], ...updates };
      this.invalidateBounds();
      this.emitUpdateEvent(
        { labelUpdated: this.labels[index] },
        { labelUpdated: previousLabel }
      );
      return true;
    }
    return false;
  }

  /**
   * Gets all classification labels.
   */
  getLabels(): ClassificationLabel[] {
    return [...this.labels];
  }

  /**
   * Gets a specific label by ID.
   */
  getLabel(labelId: string): ClassificationLabel | undefined {
    return this.labels.find((l) => l.id === labelId);
  }

  /**
   * Clears all labels.
   */
  clearLabels(): void {
    const previousLabels = [...this.labels];
    this.labels = [];
    this.invalidateBounds();
    this.emitUpdateEvent({ labelsCleared: true }, { previousLabels });
  }

  /**
   * Sets the position of the classification overlay.
   */
  setPosition(position: Point2D): void {
    const previousPosition = { ...this.position };
    this.position = { ...position };
    this.invalidateBounds();
    this.emitUpdateEvent({ position }, { position: previousPosition });
  }

  /**
   * Gets the position of the classification overlay.
   */
  getPosition(): Point2D {
    return { ...this.position };
  }

  /**
   * Sets the hover state.
   */
  setHovered(hovered: boolean, labelId?: string): void {
    this.isHovered = hovered;
    this.hoveredLabelId = labelId;
  }

  /**
   * Gets the hover state.
   */
  getHovered(): { isHovered: boolean; labelId?: string } {
    return { isHovered: this.isHovered, labelId: this.hoveredLabelId };
  }

  /**
   * Hit tests for a specific label.
   */
  hitTestLabel(point: Point2D): string | null {
    if (!this.hitTest(point)) {
      return null;
    }

    const localPoint = this.transformPointToLocal(point);
    const bounds = this.getBounds();
    const lineHeight = this.fontSize + 4;

    // Calculate which label line was clicked
    const relativeY = localPoint.y - bounds.y - this.padding;
    const lineIndex = Math.floor(relativeY / lineHeight);

    if (lineIndex >= 0 && lineIndex < this.labels.length) {
      return this.labels[lineIndex].id;
    }

    return null;
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
          this.drawRoundedRect(renderCtx, bounds, this.borderRadius);
          renderCtx.fill();
        }
        if (options.strokeStyle) {
          renderCtx.strokeStyle = options.strokeStyle;
          this.drawRoundedRect(renderCtx, bounds, this.borderRadius);
          renderCtx.stroke();
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
    } as RenderStrategy2D;
  }

  private drawClassificationLabels(
    strategy: RenderStrategy2D,
    ctx: CanvasRenderingContext2D
  ): void {
    const bounds = this.getBounds();

    // Draw background
    strategy.drawRect(ctx, bounds, {
      fillStyle: this.backgroundColor,
    });

    // Draw each label
    const lineHeight = this.fontSize + 4;
    let y = bounds.y + this.padding + this.fontSize;

    for (let i = 0; i < this.labels.length; i++) {
      const label = this.labels[i];
      const isHovered = this.hoveredLabelId === label.id;
      const textColor = isHovered
        ? this.lightenColor(label.color || this.textColor)
        : label.color || this.textColor;

      // Format label text
      const labelText = this.showConfidence
        ? `${label.label} (${(label.confidence * 100).toFixed(1)}%)`
        : label.label;

      strategy.drawText(
        ctx,
        labelText,
        { x: bounds.x + this.padding, y },
        {
          font: `${this.fontSize}px Arial`,
          fillStyle: textColor,
          textBaseline: "top",
          maxWidth: this.maxWidth - this.padding * 2,
        }
      );

      y += lineHeight;
    }
  }

  private calculateBounds(): BoundingBox {
    if (this.labels.length === 0) {
      return { x: this.position.x, y: this.position.y, width: 0, height: 0 };
    }

    // Create a temporary canvas to measure text
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    ctx.font = `${this.fontSize}px Arial`;

    let maxWidth = 0;
    for (const label of this.labels) {
      const labelText = this.showConfidence
        ? `${label.label} (${(label.confidence * 100).toFixed(1)}%)`
        : label.label;
      const textWidth = ctx.measureText(labelText).width;
      maxWidth = Math.max(maxWidth, textWidth);
    }

    const contentWidth = Math.min(maxWidth + this.padding * 2, this.maxWidth);
    const contentHeight =
      this.labels.length * (this.fontSize + 4) + this.padding * 2;

    return {
      x: this.position.x,
      y: this.position.y,
      width: contentWidth,
      height: contentHeight,
    };
  }

  private drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    bounds: BoundingBox,
    radius: number
  ): void {
    const { x, y, width, height } = bounds;

    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
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

  private invalidateBounds(): void {
    this.cachedBounds = undefined;
  }

  private emitUpdateEvent(
    changes: Record<string, any>,
    previousState: Record<string, any>
  ): void {
    // Event emission would be handled by the scene
    // This is a placeholder for the interface
  }
}

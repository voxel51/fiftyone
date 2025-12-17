/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type {
  Dimensions2D,
  DrawStyle,
  Point,
  Rect,
  TextOptions,
} from "../types";
import type { ImageOptions, ImageSource } from "./Renderer2D";

/**
 * Mock implementation of Renderer2D for lightweight testing and development.
 * This mock provides no-op implementations of all renderer methods, making it
 * suitable for creating lightweight lighter scenes without actual rendering.
 */
export class MockRenderer2D {
  private canvas: HTMLCanvasElement;
  private tickHandlers: (() => void)[] = [];
  private containers = new Map<string, any>();
  private scale = 1;
  private containerDimensions = { width: 800, height: 600 };

  constructor(canvas?: HTMLCanvasElement) {
    this.canvas = canvas || document.createElement("canvas");
  }

  addTickHandler(onFrame: () => void): void {
    this.tickHandlers.push(onFrame);
  }

  resetTickHandler(): void {
    this.tickHandlers = [];
  }

  // Drawing methods - all no-op implementations
  drawHandles(
    bounds: Rect,
    width: number,
    color: number | string,
    containerId: string
  ): void {
    this.containers.set(containerId, {
      type: "handles",
      bounds,
      width,
      color,
    });
  }

  drawScrim(bounds: Rect, borderWidth: number, containerId: string): void {
    this.containers.set(containerId, {
      type: "scrim",
      bounds,
      borderWidth,
    });
  }

  drawRect(bounds: Rect, style: DrawStyle, containerId: string): void {
    this.containers.set(containerId, {
      type: "rect",
      bounds,
      style,
    });
  }

  drawText(
    text: string,
    position: Point,
    options: TextOptions | undefined,
    containerId: string
  ): Dimensions2D {
    this.containers.set(containerId, {
      type: "text",
      text,
      position,
      options,
    });
    return { width: text.length * 8, height: 16 };
  }

  drawLine(
    start: Point,
    end: Point,
    style: DrawStyle,
    containerId: string
  ): void {
    this.containers.set(containerId, {
      type: "line",
      start,
      end,
      style,
    });
  }

  drawImage(
    image: ImageSource,
    destination: Rect,
    options: ImageOptions | undefined,
    containerId: string
  ): void {
    this.containers.set(containerId, {
      type: "image",
      image,
      destination,
      options,
    });
  }

  dispose(containerId: string): void {
    this.containers.delete(containerId);
  }

  hide(containerId: string): void {
    const container = this.containers.get(containerId);
    if (container) {
      container.visible = false;
    }
  }

  show(containerId: string): void {
    const container = this.containers.get(containerId);
    if (container) {
      container.visible = true;
    }
  }

  updateResourceBounds(containerId: string, bounds: Rect): void {
    const container = this.containers.get(containerId);
    if (container) {
      container.bounds = bounds;
    }
  }

  // Hit testing
  hitTest(point: Point, containerId?: string): boolean {
    if (containerId) {
      const container = this.containers.get(containerId);
      if (!container || !container.visible) return false;

      const bounds = container.bounds || container.destination;
      if (!bounds) return false;

      return (
        point.x >= bounds.x &&
        point.x <= bounds.x + bounds.width &&
        point.y >= bounds.y &&
        point.y <= bounds.y + bounds.height
      );
    }

    for (const [id] of this.containers) {
      if (this.hitTest(point, id)) {
        return true;
      }
    }
    return false;
  }

  getBounds(containerId: string): Rect | undefined {
    const container = this.containers.get(containerId);
    return container?.bounds || container?.destination;
  }

  getContainerDimensions(): { width: number; height: number } {
    return this.containerDimensions;
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  disableZoomPan(): void {}

  enableZoomPan(): void {}

  screenToWorld(screenPoint: Point): Point {
    return {
      x: screenPoint.x / this.scale,
      y: screenPoint.y / this.scale,
    };
  }

  getScale(): number {
    return this.scale;
  }

  setScale(scale: number): void {
    this.scale = scale;
  }

  getViewportPosition(): { x: number; y: number } {
    return { x: 0, y: 0 };
  }

  cleanUp(): void {
    this.resetTickHandler();
    this.containers.clear();
  }

  destroy(): void {
    this.cleanUp();
  }

  getContainerCount(): number {
    return this.containers.size;
  }

  getContainer(containerId: string): any {
    return this.containers.get(containerId);
  }

  setContainerDimensions(dimensions: { width: number; height: number }): void {
    this.containerDimensions = dimensions;
  }

  tick(): void {
    this.tickHandlers.forEach((handler) => handler());
  }
}

/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { Viewport } from "pixi-viewport";
import * as PIXI from "pixi.js";
import {
  DEFAULT_TEXT_PADDING,
  FONT_FAMILY,
  FONT_SIZE,
  FONT_WEIGHT,
  HANDLE_COLOR,
  HANDLE_FACTOR,
  HANDLE_OUTLINE,
} from "../constants";
import type { EventBus } from "../event/EventBus";
import { LIGHTER_EVENTS } from "../event/EventBus";
import type {
  Dimensions2D,
  DrawStyle,
  Point,
  Rect,
  TextOptions,
} from "../types";
import { parseColorWithAlpha } from "../utils/color";
import { DashLine } from "./pixi-renderer-utils/dashed-line";
import type { ImageOptions, ImageSource, Renderer2D } from "./Renderer2D";
import { sharedPixiApp } from "./SharedPixiApplication";

/**
 * PixiJS renderer.
 * While we have a singleton for the PIXI application, this class manages the renderer instance
 * and the lifecycle of objects within the renderer.
 */
export class PixiRenderer2D implements Renderer2D {
  private app!: PIXI.Application;
  private tickHandler?: () => void;
  private isRunning = false;
  public eventBus?: EventBus;

  private viewport?: Viewport;

  private resizeObserver?: ResizeObserver;

  // Container hierarchy for proper layering
  private foregroundContainer!: PIXI.Container;
  private backgroundContainer!: PIXI.Container;

  // Container tracking for visibility management
  private containers = new Map<string, PIXI.Container>();

  constructor(private canvas: HTMLCanvasElement, eventBus?: EventBus) {
    this.eventBus = eventBus;
  }

  public async initializePixiJS(): Promise<void> {
    this.app = await sharedPixiApp.initialize(this.canvas);

    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (this.app && this.isReady()) {
          this.app.renderer.resize(width, height);

          if (this.eventBus) {
            this.eventBus.emit({
              type: LIGHTER_EVENTS.RESIZE,
              detail: { width, height },
            });
          }
        }
      }
    });

    // Observe the canvas parent element for size changes
    if (this.canvas.parentElement) {
      this.resizeObserver.observe(this.canvas.parentElement);
    }

    this.viewport = new Viewport({
      events: this.app.renderer.events,
    });

    this.app.stage.addChild(this.viewport);

    // Activate drag, pinch, and wheel plugins.
    this.viewport.drag().pinch().wheel();

    this.foregroundContainer = new PIXI.Container();
    this.backgroundContainer = new PIXI.Container();

    // Background content (image, etc.)
    this.viewport.addChild(this.backgroundContainer);
    this.cacheAsTexture(this.backgroundContainer);

    // Foreground content (graphics, text, non-image overlays)
    this.viewport.addChild(this.foregroundContainer);

    this.app.start();
  }

  private tick = () => {
    if (this.isRunning && this.tickHandler) this.tickHandler();
  };

  addTickHandler(onFrame: () => void): void {
    if (this.isRunning) {
    }

    this.isRunning = true;
    this.tickHandler = onFrame;

    this.app.ticker.add(this.tick);
  }

  resetTickHandler(): void {
    this.isRunning = false;

    if (this.app.ticker) {
      this.app.ticker.remove(this.tick);
    }

    this.tickHandler = undefined;
  }

  drawBoxes(
    graphics: PIXI.Graphics,
    bounds: Rect,
    width: number,
    color: number | string,
    alpha: number
  ): void {
    const halfWidth = width / 2;

    graphics.rect(bounds.x - halfWidth, bounds.y - halfWidth, width, width);
    graphics.rect(
      bounds.x + bounds.width - halfWidth,
      bounds.y - halfWidth,
      width,
      width
    );
    graphics.rect(
      bounds.x - halfWidth,
      bounds.y + bounds.height - halfWidth,
      width,
      width
    );
    graphics.rect(
      bounds.x + bounds.width - halfWidth,
      bounds.y + bounds.height - halfWidth,
      width,
      width
    );

    graphics.setFillStyle({
      width,
      color,
      alpha,
    });
    graphics.fill();
  }

  drawHandles(
    graphics: PIXI.Graphics,
    bounds: Rect,
    width: number,
    color: number | string,
    alpha: number
  ): void {
    width *= HANDLE_FACTOR;

    const outline = 2 * HANDLE_OUTLINE;
    this.drawBoxes(graphics, bounds, width + outline, color, alpha);
    this.drawBoxes(graphics, bounds, width, HANDLE_COLOR, alpha);
  }

  drawRect(bounds: Rect, style: DrawStyle, containerId: string): void {
    const graphics = new PIXI.Graphics();
    const width = style.lineWidth || 1;

    if (style.fillStyle) {
      graphics.rect(bounds.x, bounds.y, bounds.width, bounds.height);
      graphics.fill(style.fillStyle);
    }

    if (style.strokeStyle) {
      const colorObj = parseColorWithAlpha(style.strokeStyle);
      const color = colorObj.color;
      const alpha = colorObj.alpha * (style.opacity || 1);

      if (style.dashPattern && style.dashPattern.length > 0) {
        const dashLine = new DashLine(graphics, {
          dash: style.dashPattern,
          width,
          color,
          alpha,
        });
        dashLine.drawRect(bounds.x, bounds.y, bounds.width, bounds.height);

        this.drawHandles(graphics, bounds, width, color, alpha);
      } else {
        graphics.rect(bounds.x, bounds.y, bounds.width, bounds.height);
        graphics.setStrokeStyle({
          width,
          color,
          alpha,
        });
        graphics.stroke();
      }
    }

    this.addToContainer(graphics, containerId);
  }

  drawText(
    text: string,
    position: Point,
    options: TextOptions | undefined,
    containerId: string
  ): Dimensions2D {
    if (text?.length === 0) {
      return { width: 0, height: 0 };
    }

    const textStyle = new PIXI.TextStyle({
      fontFamily: options?.font || FONT_FAMILY,
      fontSize: options?.fontSize || FONT_SIZE,
      fontWeight: FONT_WEIGHT,
      fill: options?.fontColor || "#000000",
      align: "left",
      wordWrap: true,
      wordWrapWidth: options?.maxWidth || 200,
    });
    const pixiText = new PIXI.Text({ text, style: textStyle });
    pixiText.x = position.x;
    pixiText.y = position.y;

    const textBounds = pixiText.getLocalBounds();

    const finalHeight = options?.height || textBounds.height;
    const finalWidth = textBounds.width;

    if (options?.backgroundColor) {
      const padding = options.padding ?? DEFAULT_TEXT_PADDING;
      const background = new PIXI.Graphics();
      background
        .rect(
          position.x - padding,
          position.y - padding,
          finalWidth + padding * 2,
          finalHeight + padding * 2
        )
        .fill(options.backgroundColor);
      this.addToContainer(background, containerId);
    }
    this.addToContainer(pixiText, containerId);

    return { width: finalWidth, height: finalHeight };
  }

  drawLine(
    start: Point,
    end: Point,
    style: DrawStyle,
    containerId: string
  ): void {
    const graphics = new PIXI.Graphics();
    const { color, alpha } = parseColorWithAlpha(
      style.strokeStyle || "#000000"
    );

    if (style.dashPattern && style.dashPattern.length > 0) {
      const dashLine = new DashLine(graphics, {
        dash: style.dashPattern,
        width: style.lineWidth || 1,
        color: color,
        alpha: alpha * (style.opacity || 1),
      });
      dashLine.moveTo(start.x, start.y);
      dashLine.lineTo(end.x, end.y);
    } else {
      // Use solid line implementation
      graphics.setStrokeStyle({
        width: style.lineWidth || 1,
        color: color,
        alpha: alpha * (style.opacity || 1),
      });
      graphics.moveTo(start.x, start.y);
      graphics.lineTo(end.x, end.y);
      graphics.stroke();
    }

    this.addToContainer(graphics, containerId);
  }

  drawImage(
    image: ImageSource,
    destination: Rect,
    options: ImageOptions | undefined,
    containerId: string
  ): void {
    let sprite: PIXI.Sprite;
    switch (image.type) {
      case "texture":
        if (image.texture) {
          sprite = new PIXI.Sprite(image.texture);
        } else {
          return;
        }
        break;
      case "canvas":
        if (image.canvas) {
          const texture = PIXI.Texture.from(image.canvas);
          sprite = new PIXI.Sprite(texture);
        } else {
          return;
        }
        break;
      case "html-image":
        if (image.src) {
          const texture = PIXI.Texture.from(image.src);
          sprite = new PIXI.Sprite(texture);
        } else {
          return;
        }
        break;
      case "image-data":
        if (image.imageData) {
          const canvas = document.createElement("canvas");
          canvas.width = image.imageData.width;
          canvas.height = image.imageData.height;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.putImageData(image.imageData, 0, 0);
            const texture = PIXI.Texture.from(canvas);
            sprite = new PIXI.Sprite(texture);
          } else {
            return;
          }
        } else {
          return;
        }
        break;
      case "bitmap":
        if (image.bitmap) {
          const texture = PIXI.Texture.from(image.bitmap);
          sprite = new PIXI.Sprite(texture);
        } else {
          return;
        }
        break;
      case "custom":
        if (image.custom) {
          try {
            const texture = PIXI.Texture.from(image.custom);
            sprite = new PIXI.Sprite(texture);
          } catch (error) {
            return;
          }
        } else {
          return;
        }
        break;
      default:
        return;
    }
    sprite.x = destination.x;
    sprite.y = destination.y;
    sprite.width = destination.width;
    sprite.height = destination.height;
    if (options) {
      if (options.opacity !== undefined) {
        sprite.alpha = options.opacity;
      }
      if (options.rotation !== undefined) {
        sprite.rotation = options.rotation;
      }
      if (options.scaleX !== undefined || options.scaleY !== undefined) {
        sprite.scale.x = options.scaleX ?? 1;
        sprite.scale.y = options.scaleY ?? 1;
      }
    }
    this.addToContainer(sprite, containerId, false);
  }

  /**
   * Optimize rendering by caching static graphics as textures
   * Use this for overlays that don't change frequently
   */
  cacheAsTexture(container: PIXI.Container): void {
    if (container && container.children && container.children.length > 0) {
      container.cacheAsTexture(true);
    }
  }

  /**
   * Get the underlying PixiJS application for advanced usage
   */
  getPixiApp(): PIXI.Application {
    return this.app;
  }

  /**
   * Disables zoom and pan interactions (e.g., during overlay dragging).
   * This prevents viewport plugins from interfering with overlay interactions.
   */
  disableZoomPan(): void {
    if (this.viewport?.plugins) {
      this.viewport.plugins.pause("drag");
      this.viewport.plugins.pause("pinch");
      this.viewport.plugins.pause("wheel");
    }
  }

  /**
   * Re-enables zoom and pan interactions after overlay interactions are complete.
   */
  enableZoomPan(): void {
    if (this.viewport?.plugins) {
      this.viewport.plugins.resume("drag");
      this.viewport.plugins.resume("pinch");
      this.viewport.plugins.resume("wheel");
    }
  }

  /**
   * Converts screen coordinates to world coordinates, accounting for viewport transformations.
   * @param screenPoint - The screen coordinates to convert.
   * @returns The world coordinates.
   */
  screenToWorld(screenPoint: Point): Point {
    if (!this.viewport) {
      return screenPoint;
    }

    const worldPoint = this.viewport.toWorld(screenPoint.x, screenPoint.y);
    return {
      x: worldPoint.x,
      y: worldPoint.y,
    };
  }

  /**
   * Check if the renderer is initialized
   */
  isReady(): boolean {
    return sharedPixiApp.isReady();
  }

  /**
   * Get the current container dimensions
   */
  getContainerDimensions(): { width: number; height: number } {
    if (!this.isReady() || !this.app) {
      return { width: 0, height: 0 };
    }

    return {
      width: this.app.renderer.width,
      height: this.app.renderer.height,
    };
  }

  /**
   * Returns the underlying HTMLCanvasElement used for rendering.
   */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * Adds an element to the appropriate container
   * @param element - The PIXI element to add
   * @param containerId - The container ID this element belongs to
   * @param addToForeground - Whether to add the element to the foreground container.
   * If false, adds the element to the background container.
   */
  private addToContainer(
    element: PIXI.Container | PIXI.Graphics | PIXI.Text | PIXI.Sprite,
    containerId: string,
    addToForeground: boolean = true
  ): void {
    let container = this.containers.get(containerId);
    if (!container) {
      container = new PIXI.Container();
      this.containers.set(containerId, container);

      if (addToForeground) {
        this.foregroundContainer.addChild(container);
      } else {
        this.backgroundContainer.addChild(container);
      }
    }
    container.addChild(element);
  }

  /**
   * Disposes of a container
   * @param containerId - The container ID to dispose
   */
  dispose(containerId: string): void {
    const container = this.containers.get(containerId);
    if (container) {
      container.destroy({ children: true });
      this.containers.delete(containerId);
    }
  }

  /**
   * Hide an overlay and all its elements
   * @param containerId - The container ID to hide
   */
  hide(containerId: string): void {
    const container = this.containers.get(containerId);
    if (container) {
      container.visible = false;
    }
  }

  /**
   * Show a previously hidden overlay and all its elements
   * @param containerId - The container ID to show
   */
  show(containerId: string): void {
    const container = this.containers.get(containerId);
    if (container) {
      container.visible = true;
    }
  }

  /**
   * Update resource bounds directly without recreating the sprite
   */
  updateResourceBounds(containerId: string, bounds: Rect): void {
    const container = this.containers.get(containerId);
    if (container) {
      for (const child of container.children) {
        if (child instanceof PIXI.Sprite) {
          child.x = bounds.x;
          child.y = bounds.y;
          child.width = bounds.width;
          child.height = bounds.height;
          break;
        }
      }
    }
  }

  hitTest(point: Point, containerId?: string): boolean {
    if (containerId) {
      const container = this.containers.get(containerId);
      if (container) {
        return this.hitTestElement(container, point);
      }
      return false;
    }
    // Test all containers if no ID specified
    for (const container of this.containers.values()) {
      if (this.hitTestElement(container, point)) {
        return true;
      }
    }
    return false;
  }

  getBounds(containerId: string): Rect | undefined {
    const container = this.containers.get(containerId);
    if (container) {
      const bounds = container.getBounds();
      return {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      };
    }
    return undefined;
  }

  private hitTestElement(container: PIXI.Container, point: Point): boolean {
    if (!container.visible || container.alpha <= 0) {
      return false;
    }

    // note: container's bound is not necessarily the same as the children's bounds
    // example: a bounding box with a small text label on top (not width of box)

    // if container has children, hit test with children
    // if not, bounds = container's bounds

    const children = container.children;

    if (children.length > 0) {
      for (const child of children) {
        const bounds = child.getBounds();

        if (
          point.x >= bounds.x &&
          point.x <= bounds.x + bounds.width &&
          point.y >= bounds.y &&
          point.y <= bounds.y + bounds.height
        ) {
          return true;
        }
      }

      return false;
    } else {
      const bounds = container.getBounds();

      return (
        point.x >= bounds.x &&
        point.x <= bounds.x + bounds.width &&
        point.y >= bounds.y &&
        point.y <= bounds.y + bounds.height
      );
    }
  }

  cleanUp(): void {
    this.resetTickHandler();
    this.viewport?.destroy({ children: true });
    this.viewport?.removeChildren();
    this.containers.clear();
    this.resizeObserver?.disconnect();
    this.app.stop();
    this.app.stage.removeChildren();
  }

  // note: be careful of calling this one.
  destroy(): void {
    sharedPixiApp.destroy();
  }
}

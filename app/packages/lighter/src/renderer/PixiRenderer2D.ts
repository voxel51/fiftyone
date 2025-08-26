/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import * as PIXI from "pixi.js";
import { DEFAULT_TEXT_PADDING } from "../constants";
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
import type { ImageOptions, ImageSource, Renderer2D } from "./Renderer2D";
import { DashLine } from "./pixi-renderer-utils/dashed-line";

/**
 * PixiJS v8 renderer
 */
export class PixiRenderer2D implements Renderer2D {
  private app!: PIXI.Application;
  private stage!: PIXI.Container;
  private renderLoop?: () => void;
  private isRunning = false;
  public eventBus?: EventBus;

  private resizeObserver?: ResizeObserver;

  // Container hierarchy for proper layering
  private foregroundContainer!: PIXI.Container;
  private backgroundContainer!: PIXI.Container;

  // Container tracking for visibility management
  private containers = new Map<string, PIXI.Container>();

  private isInitialized = false;

  constructor(private canvas: HTMLCanvasElement, eventBus?: EventBus) {
    this.eventBus = eventBus;
  }

  public async initializePixiJS(): Promise<void> {
    // Initialize PixiJS application with performance optimizations
    this.app = new PIXI.Application();

    // Set up resize observer to handle canvas resizing
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (this.app && this.isInitialized) {
          this.app.renderer.resize(width, height);

          // Emit resize event to the event bus
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

    await this.app.init({
      view: this.canvas,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      width: this.canvas.parentElement!.clientWidth,
      height: this.canvas.parentElement!.clientHeight,
      backgroundAlpha: 0,
    });

    this.stage = this.app.stage;

    // Create containers for proper layering hierarchy
    this.foregroundContainer = new PIXI.Container();
    this.backgroundContainer = new PIXI.Container();

    // Add containers to stage in proper layering order (background to foreground)
    this.stage.addChild(this.backgroundContainer); // Background content (images, etc.)
    this.stage.addChild(this.foregroundContainer); // Foreground content (graphics, text, overlays)

    this.isInitialized = true;
  }

  private tick = () => {
    if (this.isRunning && this.renderLoop) this.renderLoop();
  };

  startRenderLoop(onFrame: () => void): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.renderLoop = onFrame;

    this.app.ticker.add(this.tick);
  }

  stopRenderLoop(): void {
    this.isRunning = false;
    this.renderLoop = undefined;

    this.app.ticker.remove(this.tick);
  }

  drawRect(bounds: Rect, style: DrawStyle, containerId: string): void {
    const graphics = new PIXI.Graphics();

    if (style.fillStyle) {
      graphics.rect(bounds.x, bounds.y, bounds.width, bounds.height);
      graphics.fill(style.fillStyle);
    }

    if (style.strokeStyle) {
      const { color, alpha } = parseColorWithAlpha(style.strokeStyle);
      if (style.dashPattern && style.dashPattern.length > 0) {
        const dashLine = new DashLine(graphics, {
          dash: style.dashPattern,
          width: style.lineWidth || 1,
          color: color,
          alpha: alpha * (style.opacity || 1),
        });
        dashLine.drawRect(bounds.x, bounds.y, bounds.width, bounds.height);
      } else {
        graphics.rect(bounds.x, bounds.y, bounds.width, bounds.height);
        graphics.setStrokeStyle({
          width: style.lineWidth || 1,
          color: color,
          alpha: alpha * (style.opacity || 1),
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
    const textStyle = new PIXI.TextStyle({
      fontFamily: options?.font || "Arial",
      fontSize: options?.fontSize || 14,
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
    this.addToContainer(sprite, containerId);
  }

  clear(): void {
    this.foregroundContainer.removeChildren();
    this.backgroundContainer.removeChildren();
    this.containers.clear();
    this.resizeObserver?.disconnect();
  }

  /**
   * Optimize rendering by caching static graphics as textures
   * Use this for overlays that don't change frequently
   * In v8, cacheAsBitmap is replaced with cacheAsTexture
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
   * Get the stage for direct PixiJS manipulation
   */
  getStage(): PIXI.Container {
    return this.stage;
  }

  /**
   * Check if the renderer is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Get the current container dimensions
   */
  getContainerDimensions(): { width: number; height: number } {
    if (!this.isInitialized || !this.app) {
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
   * Creates or gets a container for a given ID
   * @param containerId - The container ID
   * @returns The container for this ID
   */
  private getOrCreateContainer(containerId: string): PIXI.Container {
    let container = this.containers.get(containerId);
    if (!container) {
      container = new PIXI.Container();
      this.containers.set(containerId, container);
      this.foregroundContainer.addChild(container);
    }
    return container;
  }

  /**
   * Adds an element to the appropriate container
   * @param element - The PIXI element to add
   * @param containerId - The container ID this element belongs to
   */
  private addToContainer(
    element: PIXI.Container | PIXI.Graphics | PIXI.Text | PIXI.Sprite,
    containerId: string
  ): void {
    const container = this.getOrCreateContainer(containerId);
    container.addChild(element);
  }

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
   * Update resource bounds directly without recreating the sprite to avoid flicker during resize
   */
  updateResourceBounds(containerId: string, bounds: Rect): void {
    const container = this.containers.get(containerId);
    if (container) {
      // Find the sprite in the container and update its bounds
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

  // Hit testing methods
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
}

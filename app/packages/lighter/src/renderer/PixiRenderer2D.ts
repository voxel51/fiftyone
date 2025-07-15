/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import * as PIXI from "pixi.js";
import type { EventBus } from "../event/EventBus";
import { LIGHTER_EVENTS } from "../event/EventBus";
import type { DrawStyle, Point, Rect, TextOptions } from "../types";
import type { ImageOptions, ImageSource, Renderer2D } from "./Renderer2D";

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

  // Graphics and text containers
  private graphicsContainer!: PIXI.Container;
  private textContainer!: PIXI.Container;

  // Element tracking for disposal
  private elementMap = new Map<
    string,
    PIXI.Container | PIXI.Graphics | PIXI.Text | PIXI.Sprite
  >();

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
      antialias: false, // Disable for better performance on older devices
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      width: this.canvas.parentElement!.clientWidth,
      height: this.canvas.parentElement!.clientHeight,
      backgroundAlpha: 0,
    });

    this.stage = this.app.stage;

    // Create containers for different types of elements
    this.graphicsContainer = new PIXI.Container();
    this.textContainer = new PIXI.Container();

    this.stage.addChild(this.graphicsContainer);
    this.stage.addChild(this.textContainer);

    this.isInitialized = true;
  }

  startRenderLoop(onFrame: () => void): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.renderLoop = onFrame;

    this.app.ticker.add((ticker) => {
      if (this.isRunning && this.renderLoop) {
        this.renderLoop();
      }
    });
  }

  stopRenderLoop(): void {
    this.isRunning = false;
    this.renderLoop = undefined;

    if (this.app.ticker) {
      this.app.ticker.stop();
    }
  }

  drawRect(bounds: Rect, style: DrawStyle, id?: string): void {
    const graphics = new PIXI.Graphics();

    graphics.rect(bounds.x, bounds.y, bounds.width, bounds.height);

    // Apply fill if specified
    if (style.fillStyle) {
      graphics.fill(style.fillStyle);
    }

    // Apply stroke if specified
    if (style.strokeStyle) {
      const { color, alpha } = this.parseColorWithAlpha(style.strokeStyle);

      if (style.dashPattern && style.dashPattern.length > 0) {
        // Draw dashed stroke using multiple line segments
        this.drawDashedRect(graphics, bounds, {
          color,
          alpha: alpha * (style.opacity || 1),
          width: style.lineWidth || 1,
          dashPattern: style.dashPattern,
        });
      } else {
        // Draw solid stroke
        const strokeOptions: PIXI.StrokeStyle = {
          width: style.lineWidth || 1,
          color: color,
          alpha: alpha * (style.opacity || 1),
        };
        graphics.setStrokeStyle(strokeOptions);
        graphics.stroke();
      }
    }

    // Add selection highlight if selected
    if (style.isSelected) {
      const selectionColor = style.selectionColor || "#ff6600"; // Default orange
      const { color: selColor, alpha: selAlpha } =
        this.parseColorWithAlpha(selectionColor);

      // Create selection border with dotted pattern
      const selectionGraphics = new PIXI.Graphics();
      selectionGraphics.rect(
        bounds.x - 2,
        bounds.y - 2,
        bounds.width + 4,
        bounds.height + 4
      );
      selectionGraphics.setStrokeStyle({
        width: 2,
        color: selColor,
        alpha: selAlpha,
        cap: "round",
        join: "round",
      });
      selectionGraphics.stroke();

      this.graphicsContainer.addChild(selectionGraphics);

      // Track selection border separately for disposal
      if (id) {
        this.elementMap.set(`${id}-selection`, selectionGraphics);
      }
    }

    this.graphicsContainer.addChild(graphics);

    // Track the element if an ID is provided
    if (id) {
      this.elementMap.set(id, graphics);
    }
  }

  drawText(
    text: string,
    position: Point,
    options?: TextOptions,
    id?: string
  ): void {
    // Create text with performance optimizations
    // In v8, Text constructor takes an object with text and style properties
    const textStyle = new PIXI.TextStyle({
      fontFamily: options?.font || "Arial",
      fontSize: options?.fontSize || 12,
      fill: options?.fontColor || "#000000",
      align: "left",
      wordWrap: true,
      wordWrapWidth: options?.maxWidth || 200,
    });

    const pixiText = new PIXI.Text({
      text,
      style: textStyle,
    });
    pixiText.x = position.x;
    pixiText.y = position.y;

    // Add background if specified
    if (options?.backgroundColor) {
      const background = new PIXI.Graphics();
      background.fill(options.backgroundColor);
      background.rect(
        position.x - (options.padding || 0),
        position.y - (options.padding || 0),
        pixiText.width + (options.padding || 0) * 2,
        pixiText.height + (options.padding || 0) * 2
      );
      this.textContainer.addChild(background);

      // Track background if ID is provided
      if (id) {
        this.elementMap.set(`${id}-background`, background);
      }
    }

    this.textContainer.addChild(pixiText);

    // Track the text element if an ID is provided
    if (id) {
      this.elementMap.set(id, pixiText);
    }
  }

  drawLine(start: Point, end: Point, style: DrawStyle, id?: string): void {
    const graphics = new PIXI.Graphics();

    // In v8, use setStrokeStyle instead of lineStyle
    const { color, alpha } = this.parseColorWithAlpha(
      style.strokeStyle || "#000000"
    );
    graphics.setStrokeStyle({
      width: style.lineWidth || 1,
      color: color,
      alpha: alpha * (style.opacity || 1),
    });

    graphics.moveTo(start.x, start.y);
    graphics.lineTo(end.x, end.y);

    this.graphicsContainer.addChild(graphics);

    // Track the element if an ID is provided
    if (id) {
      this.elementMap.set(id, graphics);
    }
  }

  drawImage(
    image: ImageSource,
    destination: Rect,
    options?: ImageOptions,
    id?: string
  ): void {
    let sprite: PIXI.Sprite;

    switch (image.type) {
      case "texture":
        // Handle TextureLike objects (e.g., Pixi textures)
        if (image.texture) {
          sprite = new PIXI.Sprite(image.texture);
        } else {
          console.warn("Texture source provided but no texture object found");
          return;
        }
        break;

      case "canvas":
        // Handle HTMLCanvasElement
        if (image.canvas) {
          const texture = PIXI.Texture.from(image.canvas);
          sprite = new PIXI.Sprite(texture);
        } else {
          console.warn("Canvas source provided but no canvas object found");
          return;
        }
        break;

      case "html-image":
        // Handle HTMLImageElement
        if (image.src) {
          const texture = PIXI.Texture.from(image.src);
          sprite = new PIXI.Sprite(texture);
        } else {
          console.warn("HTML image source provided but no src found");
          return;
        }
        break;

      case "image-data":
        // Handle ImageData objects
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
            console.warn("Failed to get 2D context for ImageData");
            return;
          }
        } else {
          console.warn(
            "ImageData source provided but no imageData object found"
          );
          return;
        }
        break;

      case "bitmap":
        // Handle ImageBitmap objects
        if (image.bitmap) {
          const texture = PIXI.Texture.from(image.bitmap);
          sprite = new PIXI.Sprite(texture);
        } else {
          console.warn("Bitmap source provided but no bitmap object found");
          return;
        }
        break;

      case "custom":
        // Handle custom implementations
        if (image.custom) {
          // Try to create texture from custom object
          try {
            const texture = PIXI.Texture.from(image.custom);
            sprite = new PIXI.Sprite(texture);
          } catch (error) {
            console.warn(
              "Failed to create texture from custom image source:",
              error
            );
            return;
          }
        } else {
          console.warn("Custom source provided but no custom object found");
          return;
        }
        break;

      default:
        console.warn(`Unsupported image source type: ${image.type}`);
        return;
    }

    // Apply positioning and sizing
    sprite.x = destination.x;
    sprite.y = destination.y;
    sprite.width = destination.width;
    sprite.height = destination.height;

    // Apply options
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

    this.graphicsContainer.addChild(sprite);

    // Track the element if an ID is provided
    if (id) {
      this.elementMap.set(id, sprite);
    }
  }

  clear(): void {
    // Clear graphics container efficiently
    this.graphicsContainer.removeChildren();
    this.textContainer.removeChildren();
    // Clear the element map as well
    this.elementMap.clear();
    this.resizeObserver?.disconnect();
  }

  private parseColorWithAlpha(color: string): { color: number; alpha: number } {
    // Convert CSS color to PixiJS color format
    if (color.startsWith("#")) {
      const hex = parseInt(color.slice(1), 16);
      const alpha = 1;
      return { color: hex, alpha };
    }

    if (color.startsWith("rgb")) {
      // Handle rgba and rgb formats
      const match = color.match(
        /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/
      );
      if (match) {
        const [, r, g, b, a] = match;
        const alpha = a ? parseFloat(a) : 1;
        const hex = (parseInt(r) << 16) | (parseInt(g) << 8) | parseInt(b);
        return { color: hex, alpha };
      }
    }

    if (color.startsWith("hsl")) {
      // Handle hsla and hsl formats
      const match = color.match(
        /hsla?\(([\d.]+),\s*(\d+)%,\s*(\d+)%(?:,\s*([\d.]+))?\)/
      );
      if (match) {
        const [, h, s, l, a] = match;
        const alpha = a ? parseFloat(a) : 1;
        const rgb = this.hslToRgb(parseFloat(h), parseInt(s), parseInt(l));
        const hex = (rgb.r << 16) | (rgb.g << 8) | rgb.b;
        return { color: hex, alpha };
      }
    }

    // Default to black
    return { color: 0x000000, alpha: 1 };
  }

  private hslToRgb(
    h: number,
    s: number,
    l: number
  ): { r: number; g: number; b: number } {
    // Normalize hue to 0-360
    h = h % 360;
    if (h < 0) h += 360;

    // Normalize saturation and lightness to 0-1
    s = Math.max(0, Math.min(100, s)) / 100;
    l = Math.max(0, Math.min(100, l)) / 100;

    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;

    let r = 0,
      g = 0,
      b = 0;

    if (h >= 0 && h < 60) {
      r = c;
      g = x;
      b = 0;
    } else if (h >= 60 && h < 120) {
      r = x;
      g = c;
      b = 0;
    } else if (h >= 120 && h < 180) {
      r = 0;
      g = c;
      b = x;
    } else if (h >= 180 && h < 240) {
      r = 0;
      g = x;
      b = c;
    } else if (h >= 240 && h < 300) {
      r = x;
      g = 0;
      b = c;
    } else if (h >= 300 && h < 360) {
      r = c;
      g = 0;
      b = x;
    }

    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255),
    };
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

  // Add the dispose method
  dispose(id: string): void {
    const element = this.elementMap.get(id);
    if (element) {
      // Remove from parent container
      if (element.parent) {
        element.parent.removeChild(element);
      }
      // Remove from tracking map
      this.elementMap.delete(id);

      // If it's a sprite, destroy the texture to free memory
      if (element instanceof PIXI.Sprite && element.texture) {
        // element.texture.destroy(true);
      }

      // Destroy the element itself
      element.destroy({ children: true });
    }

    // Also dispose of related elements (like text backgrounds and selection borders)
    const backgroundElement = this.elementMap.get(`${id}-background`);
    if (backgroundElement) {
      if (backgroundElement.parent) {
        backgroundElement.parent.removeChild(backgroundElement);
      }
      this.elementMap.delete(`${id}-background`);
      backgroundElement.destroy({ children: true });
    }

    const selectionElement = this.elementMap.get(`${id}-selection`);
    if (selectionElement) {
      if (selectionElement.parent) {
        selectionElement.parent.removeChild(selectionElement);
      }
      this.elementMap.delete(`${id}-selection`);
      selectionElement.destroy({ children: true });
    }
  }

  // Hit testing methods
  hitTest(point: Point, id?: string): boolean {
    if (id) {
      const element = this.elementMap.get(id);
      if (element) {
        return this.hitTestElement(element, point);
      }
      return false;
    }

    // Test all elements if no ID specified (in reverse order for proper z-order)
    const elements = Array.from(this.elementMap.values()).reverse();
    for (const element of elements) {
      if (this.hitTestElement(element, point)) {
        return true;
      }
    }
    return false;
  }

  getBounds(id: string): Rect | undefined {
    const element = this.elementMap.get(id);
    if (element) {
      const bounds = element.getBounds();
      return {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      };
    }
    return undefined;
  }

  private hitTestElement(element: PIXI.Container, point: Point): boolean {
    // Check if element is visible and interactive
    if (!element.visible || element.alpha <= 0) {
      return false;
    }

    // Get global bounds (already in screen coordinates)
    const bounds = element.getBounds();

    // Simple bounds check
    return (
      point.x >= bounds.x &&
      point.x <= bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y <= bounds.y + bounds.height
    );
  }

  private drawDashedRect(
    graphics: PIXI.Graphics,
    bounds: Rect,
    style: {
      color: number;
      alpha: number;
      width: number;
      dashPattern: number[];
    }
  ): void {
    const { color, alpha, width, dashPattern } = style;
    const dashLength = dashPattern[0];
    const gapLength = dashPattern[1];

    // Set stroke style for dashed lines
    graphics.setStrokeStyle({
      width,
      color,
      alpha,
      cap: "round",
      join: "round",
    });

    // Draw dashed top line
    this.drawDashedLine(
      graphics,
      bounds.x,
      bounds.y,
      bounds.x + bounds.width,
      bounds.y,
      dashLength,
      gapLength
    );

    // Draw dashed right line
    this.drawDashedLine(
      graphics,
      bounds.x + bounds.width,
      bounds.y,
      bounds.x + bounds.width,
      bounds.y + bounds.height,
      dashLength,
      gapLength
    );

    // Draw dashed bottom line
    this.drawDashedLine(
      graphics,
      bounds.x + bounds.width,
      bounds.y + bounds.height,
      bounds.x,
      bounds.y + bounds.height,
      dashLength,
      gapLength
    );

    // Draw dashed left line
    this.drawDashedLine(
      graphics,
      bounds.x,
      bounds.y + bounds.height,
      bounds.x,
      bounds.y,
      dashLength,
      gapLength
    );

    // Apply the stroke to all dashed lines
    graphics.stroke();
  }

  private drawDashedLine(
    graphics: PIXI.Graphics,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    dashLength: number,
    gapLength: number
  ): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const unitX = dx / distance;
    const unitY = dy / distance;

    let currentDistance = 0;
    let isDrawing = true;

    while (currentDistance < distance) {
      const segmentLength = isDrawing ? dashLength : gapLength;
      const nextDistance = Math.min(currentDistance + segmentLength, distance);

      if (isDrawing) {
        const startX = x1 + unitX * currentDistance;
        const startY = y1 + unitY * currentDistance;
        const endX = x1 + unitX * nextDistance;
        const endY = y1 + unitY * nextDistance;

        graphics.moveTo(startX, startY);
        graphics.lineTo(endX, endY);
      }

      currentDistance = nextDistance;
      isDrawing = !isDrawing;
    }
  }
}

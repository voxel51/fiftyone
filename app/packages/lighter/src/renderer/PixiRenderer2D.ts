/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import * as PIXI from "pixi.js";
import type { DrawStyle, Point, Rect, TextOptions } from "../types";
import type { Renderer2D } from "./Renderer2D";

/**
 * PixiJS v8 renderer implementation with performance optimizations.
 */
export class PixiRenderer2D implements Renderer2D {
  private app!: PIXI.Application;
  private stage!: PIXI.Container;
  private renderLoop?: () => void;
  private isRunning = false;

  // Graphics and text containers
  private graphicsContainer!: PIXI.Container;
  private textContainer!: PIXI.Container;

  private isInitialized = false;

  constructor(private canvas: HTMLCanvasElement) {
    // this.initializePixiJS().catch(console.error);
  }

  public async initializePixiJS(): Promise<void> {
    // Initialize PixiJS application with performance optimizations
    this.app = new PIXI.Application();

    // Set up resize observer to handle canvas resizing
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (this.app && this.isInitialized) {
          this.app.renderer.resize(width, height);
        }
      }
    });

    // Observe the canvas parent element for size changes
    if (this.canvas.parentElement) {
      resizeObserver.observe(this.canvas.parentElement);
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

    // Use PixiJS ticker for optimal performance
    // In v8, ticker callback receives the ticker instance instead of delta time
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

  drawRect(bounds: Rect, style: DrawStyle): void {
    const graphics = new PIXI.Graphics();

    graphics.rect(bounds.x, bounds.y, bounds.width, bounds.height);

    // Apply fill if specified
    if (style.fillStyle) {
      graphics.fill(style.fillStyle);
    }

    // Apply stroke if specified
    if (style.strokeStyle) {
      const { color, alpha } = this.parseColorWithAlpha(style.strokeStyle);
      graphics.setStrokeStyle({
        width: style.lineWidth || 1,
        color: color,
        alpha: alpha * (style.opacity || 1),
      });
    }

    this.graphicsContainer.addChild(graphics);
  }

  drawText(text: string, position: Point, options?: TextOptions): void {
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
    }

    this.textContainer.addChild(pixiText);
  }

  drawLine(start: Point, end: Point, style: DrawStyle): void {
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
  }

  drawCircle(center: Point, radius: number, style: DrawStyle): void {
    const graphics = new PIXI.Graphics();

    // Apply fill if specified
    if (style.fillStyle) {
      const { color, alpha } = this.parseColorWithAlpha(style.fillStyle);
      graphics.beginFill(color, alpha);
    }

    // Apply stroke if specified
    if (style.strokeStyle) {
      const { color, alpha } = this.parseColorWithAlpha(style.strokeStyle);
      graphics.setStrokeStyle({
        width: style.lineWidth || 1,
        color: color,
        alpha: alpha * (style.opacity || 1),
      });
    }

    graphics.drawCircle(center.x, center.y, radius);

    // End fill if we started one
    if (style.fillStyle) {
      graphics.endFill();
    }

    this.graphicsContainer.addChild(graphics);
  }

  clear(): void {
    // Clear graphics container efficiently
    this.graphicsContainer.removeChildren();
    this.textContainer.removeChildren();
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

    // Default to black
    return { color: 0x000000, alpha: 1 };
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
}

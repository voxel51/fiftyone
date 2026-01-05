/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { EventDispatcher, getEventBus } from "@fiftyone/events";
import { Viewport } from "pixi-viewport";
import * as PIXI from "pixi.js";
import {
  DEFAULT_TEXT_PADDING,
  FONT_FAMILY,
  FONT_SIZE,
  FONT_WEIGHT,
  HANDLE_ALPHA,
  HANDLE_COLOR,
  HANDLE_FACTOR,
  HANDLE_OUTLINE,
  SELECTED_ALPHA,
  SELECTED_COLOR,
  TAB_GAP_DEFAULT,
} from "../constants";
import type { LighterEventGroup } from "../events";
import type { DrawStyle, Point, Rect, TextOptions } from "../types";
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
  private eventBus: EventDispatcher<LighterEventGroup>;

  private viewport?: Viewport;

  private resizeObserver?: ResizeObserver;

  // Container hierarchy for proper layering
  private foregroundContainer!: PIXI.Container;
  private backgroundContainer!: PIXI.Container;

  // Container tracking for visibility management
  private containers = new Map<string, PIXI.Container>();

  constructor(private canvas: HTMLCanvasElement, sceneId: string) {
    this.eventBus = getEventBus<LighterEventGroup>(sceneId);
  }

  public async initializePixiJS(): Promise<void> {
    this.app = await sharedPixiApp.initialize(this.canvas);

    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (this.app && this.isReady()) {
          this.app.renderer.resize(width, height);

          // Force immediate render to prevent black flash
          if (this.viewport) {
            this.app.renderer.render(this.app.stage);
          }

          this.eventBus.dispatch("lighter:resize", { width, height });
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

    // to re-render the scene with updated scaling
    // TODO: throttle?
    this.viewport.on("zoomed", (_data) => {
      if (this.viewport) {
        this.eventBus.dispatch("lighter:zoomed", {
          scale: this.viewport.scaled,
        });
      }
    });

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
    bounds: Rect,
    width: number,
    color: number | string,
    containerId: string
  ): void {
    width *= HANDLE_FACTOR / this.getScale();
    const graphics = new PIXI.Graphics();
    const outline = (2 * HANDLE_OUTLINE) / this.getScale();

    this.drawBoxes(graphics, bounds, width + outline, color, HANDLE_ALPHA);
    this.drawBoxes(graphics, bounds, width, HANDLE_COLOR, HANDLE_ALPHA);

    this.addToContainer(graphics, containerId);
  }

  drawScrim(bounds: Rect, borderWidth: number, containerId: string): void {
    borderWidth /= this.getScale();
    const sceneDimensions = this.getContainerDimensions();
    const mask = new PIXI.Graphics();

    mask.rect(0, 0, sceneDimensions.width, sceneDimensions.height);
    mask.setFillStyle({ color: SELECTED_COLOR, alpha: SELECTED_ALPHA });
    mask.fill();

    const halfWidth = borderWidth / 2;
    const x = Math.max(bounds.x - halfWidth, 0);
    const y = Math.max(bounds.y - halfWidth, 0);
    const w =
      Math.min(bounds.width + borderWidth, sceneDimensions.width - bounds.x) +
      Math.min(bounds.x, 0);
    const h =
      Math.min(bounds.height + borderWidth, sceneDimensions.height - bounds.y) +
      Math.min(bounds.y, 0);

    mask.rect(x, y, w, h);
    mask.cut();

    mask.eventMode = "none";

    this.addToContainer(mask, containerId);
  }

  drawRect(bounds: Rect, style: DrawStyle, containerId: string): void {
    const graphics = new PIXI.Graphics();
    const width = (style.lineWidth || 1) / this.getScale();

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
          dash: style.dashPattern.map((dash) => dash / this.getScale()),
          width,
          color,
          alpha,
        });
        dashLine.drawRect(bounds.x, bounds.y, bounds.width, bounds.height);
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

  /**
   * Draws border of background of 'drawText'
   */
  private drawBorder(
    bounds: Rect,
    options: TextOptions | undefined,
    containerId: string
  ): void {
    if (options?.dashline) {
      const border = new PIXI.Graphics();
      const dashline = options.dashline;
      const { lineWidth, strokeStyle } = dashline;
      const scaledLineWidth = lineWidth / this.getScale();
      const halfLineWidth = scaledLineWidth / 2;

      const colorObj = parseColorWithAlpha(strokeStyle);
      const color = colorObj.color;
      const alpha = colorObj.alpha;

      let { x, y, width, height } = { ...bounds };
      x += halfLineWidth;
      y += halfLineWidth;
      height -= halfLineWidth * 2;
      width -= halfLineWidth * 2;

      const corners: Point[] = [
        { x, y },
        { x: x + width, y },
        { x: x + width, y: y + height },
        { x, y: y + height },
      ];

      // for 'tabs' shift the start point
      // such that `!options.tab` can determine if we `closePath` or not
      // i.e. tab ? draw three sides : draw four sides
      switch (options.tab) {
        case "top":
          corners.unshift(corners.pop()!);
          corners[3].y += halfLineWidth;
          break;
        case "bottom":
          corners.push(corners.shift()!);
          corners[3].y -= halfLineWidth;
          break;
        case "left":
          corners.push(corners.shift()!);
          corners.push(corners.shift()!);
          corners[3].x += halfLineWidth;
          break;
        case "right":
          corners[3].x -= halfLineWidth;
          break;
      }

      const dashLine = new DashLine(border, {
        dash: dashline.dashPattern.map((dash) => dash / this.getScale()),
        width: scaledLineWidth,
        color,
        alpha,
      });

      dashLine
        .moveTo(corners[0].x, corners[0].y)
        .lineTo(corners[1].x, corners[1].y)
        .lineTo(corners[2].x, corners[2].y)
        .lineTo(corners[3].x, corners[3].y, !options.tab);

      this.addToContainer(border, containerId);
    }
  }

  /**
   * Draws background of 'drawText'
   */
  private drawBackground(
    bounds: Rect,
    options: TextOptions | undefined,
    containerId: string
  ): void {
    if (options?.backgroundColor) {
      const background = new PIXI.Graphics();

      if (options?.rounded) {
        const radius = options?.rounded / this.getScale();

        if (options?.tab) {
          const corners = { ...bounds };
          const halfHeight = bounds.height / 2;
          const halfWidth = bounds.width / 2;

          switch (options.tab) {
            case "top":
              corners.y += halfHeight;
              corners.height -= halfHeight;
              break;
            case "bottom":
              corners.height -= halfHeight;
              break;
            case "left":
              corners.x += halfWidth;
              corners.width -= halfWidth;
              break;
            case "right":
              corners.width -= halfWidth;
              break;
          }

          background
            .roundRect(bounds.x, bounds.y, bounds.width, bounds.height, radius)
            .rect(corners.x, corners.y, corners.width, corners.height)
            .fill(options.backgroundColor);
        } else {
          background
            .roundRect(bounds.x, bounds.y, bounds.width, bounds.height, radius)
            .fill(options.backgroundColor);
        }
      } else {
        background
          .rect(bounds.x, bounds.y, bounds.width, bounds.height)
          .fill(options.backgroundColor);
      }

      this.addToContainer(background, containerId);
      this.drawBorder(bounds, options, containerId);
    }
  }

  /**
   * Calculates text and background positions based on anchor and offset options.
   */
  private calculatePosition(
    position: Point,
    finalHeight: number,
    finalWidth: number,
    options: TextOptions | undefined
  ): { txt: Point; bg: Rect } {
    const padding =
      (options?.padding ?? DEFAULT_TEXT_PADDING) / this.getScale();
    const gap = TAB_GAP_DEFAULT / this.getScale();

    position.y += gap;

    // text height + top padding + bottom padding + gap
    const verticalOffset = finalHeight + padding * 2 + gap;

    const anchor = {
      vertical: "bottom",
      horizontal: "left",
      ...options?.anchor,
    };

    const offset = {
      top: 0,
      bottom: 0,
      ...options?.offset,
    };

    const txt: Point = { ...position };
    const bg: Rect = {
      ...position,
      width: finalWidth + padding * 2,
      height: finalHeight + padding * 2,
    };

    switch (anchor.vertical) {
      case "top":
        txt.y += padding;
        break;
      case "center":
        txt.y -= finalHeight / 2;
        bg.y -= finalHeight / 2 + padding;
        break;
      case "bottom":
        txt.y -= finalHeight + padding;
        bg.y -= finalHeight + padding * 2;
        break;
    }

    switch (anchor.horizontal) {
      case "left":
        txt.x += padding;
        break;
      case "center":
        txt.x -= finalWidth / 2;
        bg.x -= finalWidth / 2 + padding;
        break;
      case "right":
        txt.x -= finalWidth + padding;
        bg.x -= finalWidth + padding * 2;
        break;
    }

    if (offset.top) {
      txt.y -= verticalOffset * offset.top;
      bg.y -= verticalOffset * offset.top;
    }

    if (offset.bottom) {
      txt.y += verticalOffset * offset.bottom;
      bg.y += verticalOffset * offset.bottom;
    }

    return {
      txt,
      bg,
    };
  }

  drawText(
    text: string,
    position: Point,
    options: TextOptions | undefined,
    containerId: string
  ): Rect {
    if (text?.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    const textStyle = new PIXI.TextStyle({
      fontFamily: options?.font || FONT_FAMILY,
      fontSize: options?.fontSize || FONT_SIZE,
      fontWeight: FONT_WEIGHT,
      fontStyle: options?.fontStyle || "normal",
      fill: options?.fontColor || "#000000",
      align: "left",
      wordWrap: true,
      wordWrapWidth: options?.maxWidth || 200,
    });

    const pixiText = new PIXI.Text({ text, style: textStyle });
    pixiText.scale.set(1 / this.getScale());

    const textBounds = pixiText.getLocalBounds();

    const finalHeight =
      (options?.height || textBounds.height) / this.getScale();
    const finalWidth = textBounds.width / this.getScale();

    const { txt, bg } = this.calculatePosition(
      position,
      finalHeight,
      finalWidth,
      options
    );

    pixiText.x = txt.x;
    pixiText.y = txt.y;

    this.drawBackground(bg, options, containerId);
    this.addToContainer(pixiText, containerId);

    return bg;
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
   * Returns current scaling factor of the viewport.
   * @returns Current scaling factor.
   */
  getScale(): number {
    return this.viewport?.scaled ?? 1;
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
        // e.g. the scrim
        if (child.eventMode === "none") {
          continue;
        }

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

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
import type {
  DrawStyle,
  Point,
  Rect,
  TextOptions,
  ViewportState,
} from "../types";
import { parseColorWithAlpha } from "../utils/color";
import { clipPolygonToRect } from "../utils/geometry";
import { IndexedMaskMesh } from "./IndexedMaskMesh";
import type {
  ImageOptions,
  ImageSource,
  IndexedImage,
  Renderer2D,
} from "./Renderer2D";
import { sharedPixiApp } from "./SharedPixiApplication";
import { DashLine } from "./pixi-renderer-utils/dashed-line";

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

  // track created textures to ensure their removal
  private ownedTextures = new Map<string, PIXI.Texture[]>();

  /** Minimum zoom scale (10%). */
  private static readonly ZOOM_MIN = 0.1;

  /** Maximum zoom scale (1000%). */
  private static readonly ZOOM_MAX = 10;

  /** Zoom factor applied per zoom in/out step. */
  private static readonly ZOOM_FACTOR = 1.2;

  /** Baseline scale (100%). */
  private static readonly BASELINE_SCALE = 1;

  constructor(private canvas: HTMLCanvasElement) {
    this.eventBus = getEventBus();
  }

  setEventChannel(channelId: string) {
    this.eventBus = getEventBus(channelId);
  }

  private static async waitForFonts(): Promise<void> {
    const fonts = globalThis.document?.fonts;
    if (!fonts) {
      return;
    }
    try {
      // the app's stylesheets register the face well before lighter mounts,
      // so this waits on the specific load rather than document-wide
      // fonts.ready, which can stall renderer startup on unrelated fonts
      await fonts.load(`${FONT_WEIGHT} ${FONT_SIZE}px ${FONT_FAMILY}`);
    } catch {
      // draw with whatever font is available
    }
  }

  public async initializePixiJS(): Promise<void> {
    // Text measured before the webfont loads uses fallback-font metrics,
    // shifting label pill geometry by a few pixels
    await PixiRenderer2D.waitForFonts();

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
    // Enforce zoom bounds so wheel/pinch cannot drive scale outside [ZOOM_MIN, ZOOM_MAX].
    this.viewport.clampZoom({
      minScale: PixiRenderer2D.ZOOM_MIN,
      maxScale: PixiRenderer2D.ZOOM_MAX,
    });

    // to re-render the scene with updated scaling
    // TODO: throttle?
    this.viewport.on("zoomed", (_data) => {
      this.emitViewportZoomed();
      this.emitViewportMoved();
    });

    this.viewport.on("moved", () => {
      this.emitViewportMoved();
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
    if (!this.app || this.isRunning) {
      return;
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
    alpha: number,
  ): void {
    const halfWidth = width / 2;

    graphics.rect(bounds.x - halfWidth, bounds.y - halfWidth, width, width);
    graphics.rect(
      bounds.x + bounds.width - halfWidth,
      bounds.y - halfWidth,
      width,
      width,
    );
    graphics.rect(
      bounds.x - halfWidth,
      bounds.y + bounds.height - halfWidth,
      width,
      width,
    );
    graphics.rect(
      bounds.x + bounds.width - halfWidth,
      bounds.y + bounds.height - halfWidth,
      width,
      width,
    );

    graphics.setFillStyle({
      width,
      color,
      alpha,
    });
    graphics.fill();
  }

  /**
   * Rotates `graphics` around the center of `bounds` — shapes are drawn in
   * world coordinates, so pivoting at the center re-anchors the rotation
   * there.
   */
  private applyRotation(
    graphics: PIXI.Graphics,
    bounds: Rect,
    rotation?: number,
  ): void {
    if (!rotation) return;

    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    graphics.pivot.set(cx, cy);
    graphics.position.set(cx, cy);
    graphics.rotation = rotation;
  }

  drawHandles(
    bounds: Rect,
    width: number,
    color: number | string,
    containerId: string,
    rotation?: number,
  ): void {
    width *= HANDLE_FACTOR / this.getScale();
    const graphics = this.acquireGraphics(containerId);
    const outline = (2 * HANDLE_OUTLINE) / this.getScale();

    this.drawBoxes(graphics, bounds, width + outline, color, HANDLE_ALPHA);
    this.drawBoxes(graphics, bounds, width, HANDLE_COLOR, HANDLE_ALPHA);

    this.applyRotation(graphics, bounds, rotation);
  }

  drawScrim(
    bounds: Rect,
    canonicalMediaBounds: Rect,
    containerId: string,
    rotation?: number,
  ): void {
    const mask = this.acquireGraphics(containerId);
    mask.rect(
      canonicalMediaBounds.x,
      canonicalMediaBounds.y,
      canonicalMediaBounds.width,
      canonicalMediaBounds.height,
    );
    mask.setFillStyle({ color: SELECTED_COLOR, alpha: SELECTED_ALPHA });
    mask.fill();

    if (rotation) {
      // Rotated cutout: punch the rotated corners as a polygon, CLIPPED to
      // the media bounds. The punch is an earcut hole, and earcut requires
      // holes to lie inside the outer shape — a corner escaping the media
      // rect otherwise breaks the triangulation and leaks stray dark
      // triangles into the scrim.
      const cx = bounds.x + bounds.width / 2;
      const cy = bounds.y + bounds.height / 2;
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      const corners = [
        [-bounds.width / 2, -bounds.height / 2],
        [bounds.width / 2, -bounds.height / 2],
        [bounds.width / 2, bounds.height / 2],
        [-bounds.width / 2, bounds.height / 2],
      ].map(([x, y]) => ({
        x: cx + x * cos - y * sin,
        y: cy + x * sin + y * cos,
      }));

      const clipped = clipPolygonToRect(corners, canonicalMediaBounds);
      if (clipped.length >= 3) {
        mask.poly(clipped.flatMap((p) => [p.x, p.y]));
        mask.cut();
      }

      mask.eventMode = "none";
      return;
    }

    const x = Math.max(bounds.x, canonicalMediaBounds.x);
    const y = Math.max(bounds.y, canonicalMediaBounds.y);
    const maxRight = Math.min(
      canonicalMediaBounds.x + canonicalMediaBounds.width,
      bounds.x + bounds.width,
    );
    const w = maxRight - x;
    const maxBottom = Math.min(
      canonicalMediaBounds.y + canonicalMediaBounds.height,
      bounds.y + bounds.height,
    );
    const h = maxBottom - y;

    mask.rect(x, y, w, h);
    mask.cut();

    mask.eventMode = "none";
  }

  drawRect(
    bounds: Rect,
    style: DrawStyle,
    containerId: string,
    rotation?: number,
  ): void {
    const graphics = this.acquireGraphics(containerId);
    const width = (style.lineWidth || 1) / this.getScale();

    if (style.fillStyle) {
      graphics.rect(bounds.x, bounds.y, bounds.width, bounds.height);
      graphics.fill(style.fillStyle);
    }

    if (style.strokeStyle) {
      const colorObj = parseColorWithAlpha(style.strokeStyle);
      const color = colorObj.color;
      const alpha = colorObj.alpha * (style.opacity ?? 1);

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

    this.applyRotation(graphics, bounds, rotation);
  }

  /**
   * Draws border of background of 'drawText'
   */
  private drawBorder(
    border: PIXI.Graphics,
    bounds: Rect,
    options: TextOptions | undefined,
  ): void {
    if (options?.dashline) {
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
    }
  }

  /**
   * Draws background of 'drawText'
   */
  private drawBackground(
    background: PIXI.Graphics,
    border: PIXI.Graphics | undefined,
    bounds: Rect,
    options: TextOptions | undefined,
  ): void {
    if (options?.backgroundColor) {
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

      if (border) {
        this.drawBorder(border, bounds, options);
      }
    }
  }

  /**
   * Calculates text and background positions based on anchor and offset options.
   */
  private calculatePosition(
    position: Point,
    finalHeight: number,
    finalWidth: number,
    options: TextOptions | undefined,
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
    containerId: string,
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

    // Slot order IS z-order, so the background and its border have to claim
    // their slots before the text does — even though their geometry can only
    // be computed after the glyphs are measured. Claiming and painting are
    // separate steps precisely so that ordering survives: a Graphics renders
    // whatever geometry it holds at frame time, no matter when it was issued.
    // Both conditions read from `options` alone, so they are known up front.
    const background = options?.backgroundColor
      ? this.acquireGraphics(containerId)
      : undefined;
    const border =
      options?.backgroundColor && options?.dashline
        ? this.acquireGraphics(containerId)
        : undefined;

    const pixiText = this.acquireText(containerId, text, textStyle);
    pixiText.scale.set(1 / this.getScale());

    const textBounds = pixiText.getLocalBounds();

    const finalHeight =
      (options?.height || textBounds.height) / this.getScale();
    const finalWidth = textBounds.width / this.getScale();

    const { txt, bg } = this.calculatePosition(
      position,
      finalHeight,
      finalWidth,
      options,
    );

    pixiText.x = txt.x;
    pixiText.y = txt.y;

    if (background) {
      this.drawBackground(background, border, bg, options);
    }

    return bg;
  }

  drawPoint(
    center: Point,
    radius: number,
    style: DrawStyle,
    containerId: string,
  ): void {
    const graphics = this.acquireGraphics(containerId);
    const scaledRadius = radius / this.getScale();

    // PixiJS v8: fill() consumes the current path, so stroke needs its own
    // circle() call. This is intentional — not a redundant draw.
    if (style.fillStyle) {
      const { color, alpha } = parseColorWithAlpha(style.fillStyle);
      graphics.circle(center.x, center.y, scaledRadius);
      graphics.fill({ color, alpha: alpha * (style.opacity ?? 1) });
    }

    if (style.strokeStyle) {
      const { color, alpha } = parseColorWithAlpha(style.strokeStyle);
      graphics.circle(center.x, center.y, scaledRadius);
      graphics.setStrokeStyle({
        width: (style.lineWidth || 1) / this.getScale(),
        color,
        alpha: alpha * (style.opacity ?? 1),
      });
      graphics.stroke();
    }
  }

  drawPoints(
    centers: Point[],
    radius: number,
    style: DrawStyle,
    containerId: string,
  ): void {
    if (centers.length === 0) return;
    const graphics = this.acquireGraphics(containerId);
    const scaledRadius = radius / this.getScale();

    const fillParsed = style.fillStyle
      ? parseColorWithAlpha(style.fillStyle)
      : undefined;
    const strokeParsed = style.strokeStyle
      ? parseColorWithAlpha(style.strokeStyle)
      : undefined;

    // PixiJS v8: fill() consumes the current path, so fill and stroke each
    // need their own batch of circle() calls.
    if (fillParsed) {
      for (const center of centers) {
        graphics.circle(center.x, center.y, scaledRadius);
      }
      graphics.fill({
        color: fillParsed.color,
        alpha: fillParsed.alpha * (style.opacity ?? 1),
      });
    }

    if (strokeParsed) {
      for (const center of centers) {
        graphics.circle(center.x, center.y, scaledRadius);
      }
      graphics.setStrokeStyle({
        width: (style.lineWidth || 1) / this.getScale(),
        color: strokeParsed.color,
        alpha: strokeParsed.alpha * (style.opacity ?? 1),
      });
      graphics.stroke();
    }
  }

  drawPolygon(points: Point[], style: DrawStyle, containerId: string): void {
    if (points.length < 3) return;

    const graphics = this.acquireGraphics(containerId);

    const fillParsed = style.fillStyle
      ? parseColorWithAlpha(style.fillStyle)
      : undefined;
    const strokeParsed = style.strokeStyle
      ? parseColorWithAlpha(style.strokeStyle)
      : undefined;

    const tracePath = () => {
      graphics.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        graphics.lineTo(points[i].x, points[i].y);
      }
      graphics.closePath();
    };

    // PixiJS v8: fill() consumes the current path, so fill and stroke each
    // need their own trace.
    if (fillParsed) {
      tracePath();
      graphics.fill({
        color: fillParsed.color,
        alpha: fillParsed.alpha * (style.opacity ?? 1),
      });
    }

    if (strokeParsed) {
      tracePath();
      graphics.setStrokeStyle({
        width: (style.lineWidth || 1) / this.getScale(),
        color: strokeParsed.color,
        alpha: strokeParsed.alpha * (style.opacity ?? 1),
      });
      graphics.stroke();
    }
  }

  drawLines(
    segments: Array<[Point, Point]>,
    style: DrawStyle,
    containerId: string,
  ): void {
    if (segments.length === 0) return;
    const graphics = this.acquireGraphics(containerId);
    const { color, alpha } = parseColorWithAlpha(
      style.strokeStyle || "#000000",
    );

    if (style.dashPattern && style.dashPattern.length > 0) {
      const dashLine = new DashLine(graphics, {
        dash: style.dashPattern,
        width: (style.lineWidth || 1) / this.getScale(),
        color: color,
        alpha: alpha * (style.opacity ?? 1),
      });
      for (const [start, end] of segments) {
        dashLine.moveTo(start.x, start.y);
        dashLine.lineTo(end.x, end.y);
      }
    } else {
      graphics.setStrokeStyle({
        width: (style.lineWidth || 1) / this.getScale(),
        color: color,
        alpha: alpha * (style.opacity ?? 1),
      });

      for (const [start, end] of segments) {
        graphics.moveTo(start.x, start.y);
        graphics.lineTo(end.x, end.y);
      }
      graphics.stroke();
    }
  }

  drawLine(
    start: Point,
    end: Point,
    style: DrawStyle,
    containerId: string,
  ): void {
    const graphics = this.acquireGraphics(containerId);
    const { color, alpha } = parseColorWithAlpha(
      style.strokeStyle || "#000000",
    );

    if (style.dashPattern && style.dashPattern.length > 0) {
      const dashLine = new DashLine(graphics, {
        dash: style.dashPattern,
        width: (style.lineWidth || 1) / this.getScale(),
        color: color,
        alpha: alpha * (style.opacity ?? 1),
      });
      dashLine.moveTo(start.x, start.y);
      dashLine.lineTo(end.x, end.y);
    } else {
      // Use solid line implementation
      graphics.setStrokeStyle({
        width: (style.lineWidth || 1) / this.getScale(),
        color: color,
        alpha: alpha * (style.opacity ?? 1),
      });
      graphics.moveTo(start.x, start.y);
      graphics.lineTo(end.x, end.y);
      graphics.stroke();
    }
  }

  drawImage(
    image: ImageSource,
    destination: Rect,
    options: ImageOptions | undefined,
    containerId: string,
  ): void {
    // Resolve the texture first, then claim the slot: an unresolvable source
    // must bail without consuming one, or every later draw in the pass would
    // shift up a slot and reuse the wrong object.
    let texture: PIXI.Texture;
    // whether WE minted it, and so must destroy it when the slot moves on —
    // a texture handed in from outside belongs to the caller
    let owned = false;

    if (image.type === "indexed") {
      if (!image.indexed) {
        return;
      }
      this.drawIndexedImage(image.indexed, destination, options, containerId);
      return;
    }

    switch (image.type) {
      case "texture":
        if (!image.texture) {
          return;
        }
        texture = image.texture;
        break;
      case "canvas":
        if (!image.canvas) {
          return;
        }
        // 'skipCache: true'
        texture = PIXI.Texture.from(image.canvas, true);
        texture.source.update();
        texture.source.scaleMode = "nearest";
        owned = true;
        break;
      case "html-image":
        if (!image.src) {
          return;
        }
        texture = PIXI.Texture.from(image.src);
        break;
      case "image-data": {
        if (!image.imageData) {
          return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = image.imageData.width;
        canvas.height = image.imageData.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return;
        }
        ctx.putImageData(image.imageData, 0, 0);
        // 'skipCache: true' — the canvas is ours and nothing else can reuse it
        texture = PIXI.Texture.from(canvas, true);
        owned = true;
        break;
      }
      case "bitmap":
        if (!image.bitmap) {
          return;
        }
        texture = PIXI.Texture.from(image.bitmap);
        break;
      case "custom":
        if (!image.custom) {
          return;
        }
        try {
          texture = PIXI.Texture.from(image.custom);
        } catch {
          return;
        }
        break;
      default:
        return;
    }

    const sprite = this.acquireSprite(containerId, texture, owned, false);

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
      if (options.tint !== undefined) {
        // GPU multiply: white texture × tint = tint, no per-pixel CPU work.
        sprite.tint = options.tint;
      }
    }
  }

  /**
   * A palette-indexed raster, colored in a fragment shader. The mesh keeps
   * both textures across paints and re-uploads only what changed, so a frame
   * with new indices costs one upload and a color-scheme change costs only
   * the 256 KB lookup table.
   */
  private drawIndexedImage(
    image: IndexedImage,
    destination: Rect,
    options: ImageOptions | undefined,
    containerId: string,
  ): void {
    const mesh = this.acquireSlot<IndexedMaskMesh>(
      containerId,
      (child) => child instanceof IndexedMaskMesh,
      () => new IndexedMaskMesh(),
      (existing) => this.resetDisplayObject(existing),
      false,
    );

    mesh.setImage(image);
    // a unit quad: the destination rect is its position and scale
    mesh.position.set(destination.x, destination.y);
    mesh.scale.set(destination.width, destination.height);
    if (options?.opacity !== undefined) {
      mesh.alpha = options.opacity;
    }
    if (options?.rotation !== undefined) {
      mesh.rotation = options.rotation;
    }
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
   * Reset the viewport's zoom to 100% and clears any pan translation.
   */
  resetZoomPan(): void {
    this.viewport?.setZoom(PixiRenderer2D.BASELINE_SCALE);
    this.viewport?.moveCorner(0, 0);

    this.emitViewportZoomed();
    this.emitViewportMoved();
  }

  /**
   * Returns the current zoom and pan state of the pixi-viewport.
   */
  getViewportState(): ViewportState {
    return {
      scale: this.viewport?.scaled ?? 1,
      panX: this.viewport?.x ?? 0,
      panY: this.viewport?.y ?? 0,
    };
  }

  /**
   * Restores a previously captured zoom and pan state to the pixi-viewport.
   * When the incoming scale exceeds this renderer's zoom bounds the pan is
   * recomputed so the same world-space center point stays on screen.
   */
  setViewportState({ scale, panX, panY }: ViewportState): void {
    if (!this.viewport || this.viewport.destroyed) return;
    if (!scale || !isFinite(scale)) return;

    const clampedScale = Math.min(
      Math.max(scale, PixiRenderer2D.ZOOM_MIN),
      PixiRenderer2D.ZOOM_MAX,
    );

    if (clampedScale !== scale) {
      const cx = this.canvas.clientWidth / 2;
      const cy = this.canvas.clientHeight / 2;

      const worldCenterX = (cx - panX) / scale;
      const worldCenterY = (cy - panY) / scale;

      panX = cx - worldCenterX * clampedScale;
      panY = cy - worldCenterY * clampedScale;
    }

    this.viewport.setZoom(clampedScale);
    this.viewport.x = panX;
    this.viewport.y = panY;

    this.emitViewportZoomed();
    this.emitViewportMoved();
  }

  /**
   * Adjusts the viewport zoom and pan so that the given world-space rectangle
   * is centered and fully visible, with optional padding.
   */
  fitToRect(worldRect: Rect, padding: number = 0): void {
    if (!this.viewport || this.viewport.destroyed) return;
    if (!worldRect.width || !worldRect.height) return;

    const { width: canvasW, height: canvasH } = this.getContainerDimensions();
    if (!canvasW || !canvasH) return;

    const squeeze = 1 - padding * 2;
    const scaleX = (canvasW * squeeze) / worldRect.width;
    const scaleY = (canvasH * squeeze) / worldRect.height;
    const scale = Math.min(
      Math.max(Math.min(scaleX, scaleY), PixiRenderer2D.ZOOM_MIN),
      PixiRenderer2D.ZOOM_MAX,
    );

    const rectCenterX = worldRect.x + worldRect.width / 2;
    const rectCenterY = worldRect.y + worldRect.height / 2;
    const panX = canvasW / 2 - rectCenterX * scale;
    const panY = canvasH / 2 - rectCenterY * scale;

    this.viewport.setZoom(scale);
    this.viewport.x = panX;
    this.viewport.y = panY;

    this.emitViewportZoomed();
    this.emitViewportMoved();
  }

  /**
   * Applies a new zoom level if it differs from the current one, and emits
   * viewport events. Caller must ensure viewport exists and compute `next`.
   *
   * @param current - Current zoom level (e.g. viewport.scaled).
   * @param next - Target zoom level to apply.
   */
  private applyZoom(current: number, next: number): void {
    if (!this.viewport || this.viewport.destroyed) return;
    const clamped = Math.max(
      PixiRenderer2D.ZOOM_MIN,
      Math.min(PixiRenderer2D.ZOOM_MAX, next),
    );
    if (clamped !== current) {
      this.viewport.setZoom(clamped, true);
      this.emitViewportZoomed();
      this.emitViewportMoved();
    }
  }

  zoomIn(): void {
    if (!this.viewport || this.viewport.destroyed) return;
    const current = this.viewport.scaled;
    const next = Math.min(
      current * PixiRenderer2D.ZOOM_FACTOR,
      PixiRenderer2D.ZOOM_MAX,
    );
    this.applyZoom(current, next);
  }

  zoomOut(): void {
    if (!this.viewport || this.viewport.destroyed) return;
    const current = this.viewport.scaled;
    const next = Math.max(
      current / PixiRenderer2D.ZOOM_FACTOR,
      PixiRenderer2D.ZOOM_MIN,
    );
    this.applyZoom(current, next);
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
    if (!this.viewport || this.viewport.destroyed) {
      return PixiRenderer2D.BASELINE_SCALE;
    }
    return this.viewport.scaled;
  }

  /**
   * Returns the current viewport position (pan offset).
   * @returns The viewport position { x, y }.
   */
  getViewportPosition(): { x: number; y: number } {
    if (!this.viewport || this.viewport.destroyed) {
      return { x: 0, y: 0 };
    }
    return {
      x: this.viewport.x,
      y: this.viewport.y,
    };
  }

  /**
   * Emits a zoomed event with the current scale.
   * @private
   */
  private emitViewportZoomed(): void {
    if (this.viewport) {
      this.eventBus.dispatch("lighter:zoomed", {
        scale: this.viewport.scaled,
      });
    }
  }

  /**
   * Emits a viewport-moved event with current position and scale.
   */
  private emitViewportMoved(): void {
    if (this.viewport) {
      this.eventBus.dispatch("lighter:viewport-moved", {
        x: this.viewport.x,
        y: this.viewport.y,
        scale: this.viewport.scaled,
      });
    }
  }

  /**
   * Check if the renderer is initialized
   */
  isReady(): boolean {
    return sharedPixiApp.isReady() && this.viewport !== undefined;
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
  private getOrCreateContainer(
    containerId: string,
    addToForeground: boolean,
  ): PIXI.Container {
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

    return container;
  }

  // ---------------------------------------------------------------------------
  // Slot reuse
  //
  // An overlay repaints by listing its draw calls in order, and that order is
  // stable frame to frame — a box draws its rect, then its label background,
  // then its label. So the Nth draw of one pass can claim the display object
  // the Nth draw of the previous pass left behind, resetting it instead of
  // allocating a replacement. `beginRebuild` opens the pass, each draw claims
  // the next slot, and `endRebuild` destroys whatever the pass did not reach.
  //
  // Outside a rebuild pass there is no cursor and every draw appends, which is
  // how this renderer behaved before pooling existed.
  // ---------------------------------------------------------------------------

  /**
   * Per-container write cursor for the pass in progress. An entry means "mid
   * rebuild"; absent means draws append.
   */
  private rebuildCursors = new Map<string, number>();

  beginRebuild(containerId: string): void {
    this.rebuildCursors.set(containerId, 0);
  }

  endRebuild(containerId: string): void {
    const cursor = this.rebuildCursors.get(containerId);
    this.rebuildCursors.delete(containerId);

    if (cursor === undefined) {
      return;
    }

    const container = this.containers.get(containerId);

    if (!container) {
      return;
    }

    // Anything past the cursor is left over from a longer previous pass: this
    // one drew fewer objects, so those slots are stale.
    while (container.children.length > cursor) {
      const child = container.children[container.children.length - 1];
      container.removeChild(child);
      this.destroyChild(containerId, child);
    }
  }

  /**
   * Claims the next slot, reusing the object already there when its type
   * matches and creating one otherwise.
   */
  private acquireSlot<T extends PIXI.Container>(
    containerId: string,
    matches: (child: PIXI.Container) => boolean,
    create: () => T,
    reset: (existing: T) => void,
    addToForeground: boolean,
  ): T {
    const container = this.getOrCreateContainer(containerId, addToForeground);
    const cursor = this.rebuildCursors.get(containerId);
    const index = cursor ?? container.children.length;
    const existing = container.children[index];

    if (cursor !== undefined) {
      this.rebuildCursors.set(containerId, index + 1);
    }

    if (existing && matches(existing)) {
      const reused = existing as T;
      reset(reused);
      return reused;
    }

    const created = create();

    if (existing) {
      // this pass draws a different kind of object here — swap in place so the
      // slots below keep their objects
      container.removeChildAt(index);
      this.destroyChild(containerId, existing);
      container.addChildAt(created, index);
    } else {
      container.addChild(created);
    }

    return created;
  }

  /**
   * A reused display object carries every property the previous pass set on
   * it, so anything a draw method assigns conditionally has to be returned to
   * its default here — `eventMode` above all, which `hitTestElement` reads to
   * skip the scrim. A slot that once held a scrim would otherwise stay
   * un-hittable for the rest of its life.
   */
  private resetDisplayObject(element: PIXI.Container): void {
    element.eventMode = PIXI.EventSystem.defaultEventMode;
    element.alpha = 1;
    element.rotation = 0;
    element.visible = true;
    element.position.set(0, 0);
    element.pivot.set(0, 0);
    element.scale.set(1, 1);
  }

  private acquireGraphics(
    containerId: string,
    addToForeground = true,
  ): PIXI.Graphics {
    return this.acquireSlot<PIXI.Graphics>(
      containerId,
      (child) => child instanceof PIXI.Graphics,
      () => new PIXI.Graphics(),
      (existing) => {
        existing.clear();
        this.resetDisplayObject(existing);
      },
      addToForeground,
    );
  }

  private acquireText(
    containerId: string,
    text: string,
    style: PIXI.TextStyle,
    addToForeground = true,
  ): PIXI.Text {
    return this.acquireSlot<PIXI.Text>(
      containerId,
      (child) => child instanceof PIXI.Text,
      () => new PIXI.Text({ text, style }),
      (existing) => {
        existing.text = text;
        existing.style = style;
        this.resetDisplayObject(existing);
      },
      addToForeground,
    );
  }

  private acquireSprite(
    containerId: string,
    texture: PIXI.Texture,
    owned: boolean,
    addToForeground: boolean,
  ): PIXI.Sprite {
    const sprite = this.acquireSlot<PIXI.Sprite>(
      containerId,
      (child) => child instanceof PIXI.Sprite,
      () => new PIXI.Sprite(texture),
      (existing) => {
        if (existing.texture !== texture) {
          // Assign FIRST, then release: releasing destroys the old texture,
          // and doing that while the sprite still points at it leaves a
          // window where the sprite references destroyed GPU memory.
          const previous = existing.texture;
          existing.texture = texture;
          this.releaseTexture(containerId, previous);
        }
        this.resetDisplayObject(existing);
        // `drawImage` sets tint only when asked, so a reused sprite would
        // otherwise keep the last mask's color.
        existing.tint = 0xffffff;
      },
      addToForeground,
    );

    if (owned) {
      this.trackOwnedTexture(containerId, texture);
    }

    return sprite;
  }

  /**
   * Tear down a display object this pass is finished with.
   *
   * `context: true` is load-bearing. In Pixi 8.13 `Graphics.destroy(options)`
   * frees its owned `GraphicsContext` only when `options` is falsy or
   * `options.context === true` — `{ children: true }` hits neither branch. And
   * it is the context's own `destroy` event that evicts its entry from
   * `GraphicsContextSystem`'s `_gpuContextHash`, so trimming a slot without it
   * leaves the GPU batch data behind: the exact leak this pooling exists to
   * avoid. `destroyed` flips either way, so a test asserting that alone does
   * not notice.
   */
  private destroyChild(containerId: string, child: PIXI.Container): void {
    this.releaseSpriteTexture(containerId, child);
    child.destroy({ children: true, context: true });
  }

  /**
   * Destroys the texture a sprite slot holds, if this renderer minted it.
   * A texture handed in from outside (`type: "texture"`) is the caller's.
   */
  private releaseSpriteTexture(
    containerId: string,
    element: PIXI.Container,
  ): void {
    if (!(element instanceof PIXI.Sprite)) {
      return;
    }

    this.releaseTexture(containerId, element.texture);
  }

  /** Destroys one texture, if this renderer minted it for this container. */
  private releaseTexture(containerId: string, texture: PIXI.Texture): void {
    const tracked = this.ownedTextures.get(containerId);

    if (!tracked) {
      return;
    }

    const index = tracked.indexOf(texture);

    if (index === -1) {
      return;
    }

    tracked.splice(index, 1);
    texture.destroy(true);
  }

  private trackOwnedTexture(containerId: string, texture: PIXI.Texture): void {
    const existing = this.ownedTextures.get(containerId);
    if (existing) {
      existing.push(texture);
    } else {
      this.ownedTextures.set(containerId, [texture]);
    }
  }

  private destroyOwnedTextures(containerId: string): void {
    const textures = this.ownedTextures.get(containerId);
    if (textures) {
      for (const texture of textures) {
        texture.destroy(true);
      }
      this.ownedTextures.delete(containerId);
    }
  }

  /**
   * Disposes of a container
   * @param containerId - The container ID to dispose
   */
  dispose(containerId: string): void {
    this.rebuildCursors.delete(containerId);
    this.destroyOwnedTextures(containerId);
    const container = this.containers.get(containerId);
    if (container) {
      container.destroy({ children: true, context: true });
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

    // A pass that drew nothing leaves the container in place but empty, where
    // before pooling it would have been disposed. Pixi reports an EMPTY
    // container's bounds as infinite (minX = Infinity, width = -Infinity),
    // which `getMouseDistance` turns into NaN and sorts unpredictably. No
    // children means no bounds, same as no container.
    if (container && container.children.length > 0) {
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
    if (!this.app) {
      return;
    }

    this.resetTickHandler();
    for (const textures of this.ownedTextures.values()) {
      for (const texture of textures) {
        texture.destroy(true);
      }
    }
    this.ownedTextures.clear();
    this.rebuildCursors.clear();
    this.viewport?.destroy({ children: true, context: true });
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

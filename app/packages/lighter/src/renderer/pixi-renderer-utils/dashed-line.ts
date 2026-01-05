/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

// note: inspired by https://github.com/davidfig/pixi-dashed-line/blob/main/lib/index.ts

import * as PIXI from "pixi.js";

/** Define the dash: [dash length, gap size, dash size, gap size, ...] */
export type Dashes = number[];

export interface DashLineOptions {
  dash?: Dashes;
  width?: number;
  color?: number;
  alpha?: number;
  scale?: number;
  useTexture?: boolean;
  useDots?: boolean;
  cap?: PIXI.LineCap;
  join?: PIXI.LineJoin;
  alignment?: number;
}

const dashLineOptionsDefault: Required<DashLineOptions> = {
  dash: [10, 5],
  width: 1,
  color: 0xffffff,
  alpha: 1,
  scale: 1,
  useTexture: false,
  useDots: false,
  cap: "butt" as PIXI.LineCap,
  join: "miter" as PIXI.LineJoin,
  alignment: 0.5,
};

export class DashLine {
  graphics: PIXI.Graphics;

  /** current length of the line */
  lineLength: number = 0;

  /** cursor location */
  cursor = new PIXI.Point();

  /** desired scale of line */
  scale = 1;

  // sanity check to ensure the lineStyle is still in use
  private activeTexture!: PIXI.Texture;

  private start!: PIXI.Point;

  private dashSize: number;
  private dash: number[];

  private useTexture: boolean;
  private options: Required<DashLineOptions>;

  // cache of PIXI.Textures for dashed lines
  static dashTextureCache: Record<string, PIXI.Texture> = {};

  /**
   * Create a DashLine
   * @param graphics
   * @param [options]
   * @param [options.useTexture=false] - use the texture based render (useful for very large or very small dashed lines)
   * @param [options.dashes=[10,5] - an array holding the dash and gap (eg, [10, 5, 20, 5, ...])
   * @param [options.width=1] - width of the dashed line
   * @param [options.alpha=1] - alpha of the dashed line
   * @param [options.color=0xffffff] - color of the dashed line
   * @param [options.cap] - add a PIXI.LINE_CAP style to dashed lines (only works for useTexture: false)
   * @param [options.join] - add a PIXI.LINE_JOIN style to the dashed lines (only works for useTexture: false)
   * @param [options.alignment] - The alignment of any lines drawn (0.5 = middle, 1 = outer, 0 = inner)
   */
  constructor(graphics: PIXI.Graphics, options: DashLineOptions = {}) {
    this.graphics = graphics;
    this.options = { ...dashLineOptionsDefault, ...options };
    this.dash = this.options.dash;
    this.dashSize = this.dash.reduce((a, b) => a + b);
    this.useTexture = this.options.useTexture;
    this.setLineStyle();
  }

  /** resets line style to enable dashed line (useful if lineStyle was changed on graphics element) */
  setLineStyle() {
    const options = this.options;
    if (this.useTexture) {
      const texture = DashLine.getTexture(options, this.dashSize);
      // Note: Texture-based line styling may need different approach in newer PIXI versions
      this.graphics.setStrokeStyle({
        width: options.width * options.scale,
        color: options.color,
        alpha: options.alpha,
      });
      this.activeTexture = texture;
    } else {
      this.graphics.setStrokeStyle({
        width: options.width * options.scale,
        color: options.color,
        alpha: options.alpha,
      });
    }
    this.scale = options.scale;
  }

  private static distance(
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): number {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
  }

  moveTo(x: number, y: number): this {
    this.lineLength = 0;
    this.cursor.set(x, y);
    this.start = new PIXI.Point(x, y);
    this.graphics.moveTo(this.cursor.x, this.cursor.y);
    return this;
  }

  lineTo(x: number, y: number, closePath?: boolean): this {
    if (typeof this.lineLength === undefined) {
      this.moveTo(0, 0);
    }
    const length = DashLine.distance(this.cursor.x, this.cursor.y, x, y);
    const angle = Math.atan2(y - this.cursor.y, x - this.cursor.x);
    const closed = closePath && x === this.start.x && y === this.start.y;
    if (this.useTexture) {
      this.graphics.moveTo(this.cursor.x, this.cursor.y);
      this.adjustLineStyle(angle);
      if (closed && this.dash.length % 2 === 0) {
        const gap = Math.min(this.dash[this.dash.length - 1], length);
        this.graphics.lineTo(
          x - Math.cos(angle) * gap,
          y - Math.sin(angle) * gap
        );
        this.graphics.closePath();
      } else {
        this.graphics.lineTo(x, y);
      }
      this.graphics.stroke();
    } else {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      let x0 = this.cursor.x;
      let y0 = this.cursor.y;

      // find the first part of the dash for this line
      const place = this.lineLength % (this.dashSize * this.scale);
      let dashIndex: number = 0,
        dashStart: number = 0;
      let dashX = 0;
      for (let i = 0; i < this.dash.length; i++) {
        const dashSize = this.dash[i] * this.scale;
        if (place < dashX + dashSize) {
          dashIndex = i;
          dashStart = place - dashX;
          break;
        } else {
          dashX += dashSize;
        }
      }

      let remaining = length;
      // let count = 0
      while (remaining > 0) {
        // && count++ < 1000) {
        const dashSize = this.dash[dashIndex] * this.scale - dashStart;
        let dist = remaining > dashSize ? dashSize : remaining;
        if (closed) {
          const remainingDistance = DashLine.distance(
            x0 + cos * dist,
            y0 + sin * dist,
            this.start.x,
            this.start.y
          );
          if (remainingDistance <= dist) {
            if (dashIndex % 2 === 0) {
              const lastDash =
                DashLine.distance(x0, y0, this.start.x, this.start.y) -
                this.dash[this.dash.length - 1] * this.scale;
              x0 += cos * lastDash;
              y0 += sin * lastDash;
              this.graphics.lineTo(x0, y0);
            }
            break;
          }
        }

        x0 += cos * dist;
        y0 += sin * dist;
        if (dashIndex % 2) {
          this.graphics.moveTo(x0, y0);
        } else {
          this.graphics.lineTo(x0, y0);
        }
        remaining -= dist;

        dashIndex++;
        dashIndex = dashIndex === this.dash.length ? 0 : dashIndex;
        dashStart = 0;
      }
      // if (count >= 1000) console.log('failure', this.scale)
      this.graphics.stroke();
    }
    this.lineLength += length;
    this.cursor.set(x, y);
    return this;
  }

  closePath() {
    this.lineTo(this.start.x, this.start.y, true);
  }

  drawCircle(
    x: number,
    y: number,
    radius: number,
    points = 80,
    matrix?: PIXI.Matrix
  ): this {
    const interval = (Math.PI * 2) / points;
    let angle = 0,
      first: PIXI.Point;
    if (matrix) {
      first = new PIXI.Point(
        x + Math.cos(angle) * radius,
        y + Math.sin(angle) * radius
      );
      matrix.apply(first, first);
      this.moveTo(first.x, first.y);
    } else {
      first = new PIXI.Point(
        x + Math.cos(angle) * radius,
        y + Math.sin(angle) * radius
      );
      this.moveTo(first.x, first.y);
    }
    angle += interval;
    for (let i = 1; i < points + 1; i++) {
      const next =
        i === points
          ? first
          : new PIXI.Point(
              x + Math.cos(angle) * radius,
              y + Math.sin(angle) * radius
            );
      this.lineTo(next.x, next.y);
      angle += interval;
    }
    return this;
  }

  drawEllipse(
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    points = 80,
    matrix?: PIXI.Matrix
  ): this {
    const interval = (Math.PI * 2) / points;
    let first: { x: number; y: number } = { x: 0, y: 0 };
    const point = new PIXI.Point();
    let f = 0;
    for (let i = 0; i < Math.PI * 2; i += interval) {
      let x0 = x - radiusX * Math.sin(i);
      let y0 = y - radiusY * Math.cos(i);
      if (matrix) {
        point.set(x0, y0);
        matrix.apply(point, point);
        x0 = point.x;
        y0 = point.y;
      }
      if (i === 0) {
        this.moveTo(x0, y0);
        first = { x: x0, y: y0 };
      } else {
        this.lineTo(x0, y0);
      }
    }
    this.lineTo(first.x, first.y, true);
    return this;
  }

  drawPolygon(points: PIXI.Point[] | number[], matrix?: PIXI.Matrix): this {
    const p = new PIXI.Point();
    if (typeof points[0] === "number") {
      if (matrix) {
        p.set(points[0] as number, points[1] as number);
        matrix.apply(p, p);
        this.moveTo(p.x, p.y);
        for (let i = 2; i < points.length; i += 2) {
          p.set(points[i] as number, points[i + 1] as number);
          matrix.apply(p, p);
          this.lineTo(p.x, p.y, i === points.length - 2);
        }
      } else {
        this.moveTo(points[0] as number, points[1] as number);
        for (let i = 2; i < points.length; i += 2) {
          this.lineTo(
            points[i] as number,
            points[i + 1] as number,
            i === points.length - 2
          );
        }
      }
    } else {
      if (matrix) {
        const point = points[0] as PIXI.Point;
        p.copyFrom(point);
        matrix.apply(p, p);
        this.moveTo(p.x, p.y);
        for (let i = 1; i < points.length; i++) {
          const point = points[i] as PIXI.Point;
          p.copyFrom(point);
          matrix.apply(p, p);
          this.lineTo(p.x, p.y, i === points.length - 1);
        }
      } else {
        const point = points[0] as PIXI.Point;
        this.moveTo(point.x, point.y);
        for (let i = 1; i < points.length; i++) {
          const point = points[i] as PIXI.Point;
          this.lineTo(point.x, point.y, i === points.length - 1);
        }
      }
    }
    return this;
  }

  drawRect(
    x: number,
    y: number,
    width: number,
    height: number,
    matrix?: PIXI.Matrix
  ): this {
    if (matrix) {
      const p = new PIXI.Point();

      // moveTo(x, y)
      p.set(x, y);
      matrix.apply(p, p);
      this.moveTo(p.x, p.y);

      // lineTo(x + width, y)
      p.set(x + width, y);
      matrix.apply(p, p);
      this.lineTo(p.x, p.y);

      // lineTo(x + width, y + height)
      p.set(x + width, y + height);
      matrix.apply(p, p);
      this.lineTo(p.x, p.y);

      // lineto(x, y + height)
      p.set(x, y + height);
      matrix.apply(p, p);
      this.lineTo(p.x, p.y);

      // lineTo(x, y, true)
      p.set(x, y);
      matrix.apply(p, p);
      this.lineTo(p.x, p.y, true);
    } else {
      this.moveTo(x, y)
        .lineTo(x + width, y)
        .lineTo(x + width, y + height)
        .lineTo(x, y + height)
        .lineTo(x, y, true);
    }
    return this;
  }

  // adjust the matrix for the dashed texture
  private adjustLineStyle(angle: number) {
    // Note: This method may need to be updated based on the specific PIXI.js version
    // For newer PIXI versions, texture-based line styling may need a different approach
    // This is a placeholder for texture-based dashed line implementation
  }

  // creates or uses cached texture
  private static getTexture(
    options: Required<DashLineOptions>,
    dashSize: number
  ): PIXI.Texture {
    const key = options.dash.toString();
    if (DashLine.dashTextureCache[key]) {
      return DashLine.dashTextureCache[key];
    }
    const canvas = document.createElement("canvas");
    canvas.width = dashSize;
    canvas.height = Math.ceil(options.width);
    const context = canvas.getContext("2d");
    if (!context) {
      console.warn("Did not get context from canvas");
      // Return a fallback texture
      return PIXI.Texture.WHITE;
    }
    context.strokeStyle = "white";
    context.globalAlpha = options.alpha;
    context.lineWidth = options.width;
    let x = 0;
    const y = options.width / 2;
    context.moveTo(x, y);
    for (let i = 0; i < options.dash.length; i += 2) {
      x += options.dash[i];
      context.lineTo(x, y);
      if (options.dash.length !== i + 1) {
        x += options.dash[i + 1];
        context.moveTo(x, y);
      }
    }
    context.stroke();
    const texture = (DashLine.dashTextureCache[key] =
      PIXI.Texture.from(canvas));
    texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
    return texture;
  }
}

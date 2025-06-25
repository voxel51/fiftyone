/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type {
  Overlay,
  RenderStatus,
  Matrix,
  Point2D,
  BoundingBox,
  RenderContext,
} from "../types";

/**
 * Creates an identity transformation matrix.
 */
export function createIdentityMatrix(): Matrix {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

/**
 * Multiplies two transformation matrices.
 */
export function multiplyMatrix(a: Matrix, b: Matrix): Matrix {
  return {
    a: a.a * b.a + a.c * b.b,
    b: a.b * b.a + a.d * b.b,
    c: a.a * b.c + a.c * b.d,
    d: a.b * b.c + a.d * b.d,
    e: a.a * b.e + a.c * b.f + a.e,
    f: a.b * b.e + a.d * b.f + a.f,
  };
}

/**
 * Transforms a point using a transformation matrix.
 */
export function transformPoint(point: Point2D, matrix: Matrix): Point2D {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  };
}

/**
 * Abstract base class for all overlays.
 */
export abstract class BaseOverlay implements Overlay {
  readonly id: string;
  readonly name: string;
  readonly tags: string[];
  renderStatus: RenderStatus = "pending";
  zIndex: number = 0;
  transform: Matrix = createIdentityMatrix();

  protected isVisible: boolean = true;
  protected opacity: number = 1.0;

  constructor(id: string, name: string, tags: string[] = []) {
    this.id = id;
    this.name = name;
    this.tags = [...tags];
  }

  /**
   * Abstract render method to be implemented by subclasses.
   */
  abstract render(ctx: RenderContext): void;

  /**
   * Abstract hit test method to be implemented by subclasses.
   */
  abstract hitTest(point: Point2D): boolean;

  /**
   * Abstract bounds method to be implemented by subclasses.
   */
  abstract getBounds(): BoundingBox;

  /**
   * Applies a transformation matrix to this overlay.
   */
  applyTransform(matrix: Matrix): void {
    this.transform = multiplyMatrix(this.transform, matrix);
  }

  /**
   * Sets the transformation matrix directly.
   */
  setTransform(matrix: Matrix): void {
    this.transform = { ...matrix };
  }

  /**
   * Resets the transformation to identity.
   */
  resetTransform(): void {
    this.transform = createIdentityMatrix();
  }

  /**
   * Sets the visibility of the overlay.
   */
  setVisible(visible: boolean): void {
    this.isVisible = visible;
  }

  /**
   * Gets the visibility of the overlay.
   */
  getVisible(): boolean {
    return this.isVisible;
  }

  /**
   * Sets the opacity of the overlay.
   */
  setOpacity(opacity: number): void {
    this.opacity = Math.max(0, Math.min(1, opacity));
  }

  /**
   * Gets the opacity of the overlay.
   */
  getOpacity(): number {
    return this.opacity;
  }

  /**
   * Applies common rendering setup (transform, visibility, opacity).
   */
  protected applyRenderSetup(ctx: RenderContext): boolean {
    if (!this.isVisible || this.opacity === 0) {
      return false;
    }

    // Apply transformation
    const renderCtx = ctx.ctx;
    renderCtx.save();
    renderCtx.setTransform(
      this.transform.a,
      this.transform.b,
      this.transform.c,
      this.transform.d,
      this.transform.e,
      this.transform.f
    );

    // Apply opacity
    if (this.opacity < 1.0) {
      renderCtx.globalAlpha = this.opacity;
    }

    return true;
  }

  /**
   * Cleans up rendering setup.
   */
  protected cleanupRenderSetup(ctx: RenderContext): void {
    ctx.ctx.restore();
  }

  /**
   * Default disposal method - can be overridden by subclasses.
   */
  dispose(): void {
    // Default implementation - subclasses can override for cleanup
  }

  /**
   * Transforms a point using the inverse of this overlay's transformation.
   */
  protected transformPointToLocal(point: Point2D): Point2D {
    // Calculate inverse transform (simplified for common cases)
    const det =
      this.transform.a * this.transform.d - this.transform.b * this.transform.c;
    if (Math.abs(det) < 1e-10) {
      // Degenerate transform, return original point
      return point;
    }

    const invDet = 1 / det;
    const inv: Matrix = {
      a: this.transform.d * invDet,
      b: -this.transform.b * invDet,
      c: -this.transform.c * invDet,
      d: this.transform.a * invDet,
      e:
        (this.transform.c * this.transform.f -
          this.transform.d * this.transform.e) *
        invDet,
      f:
        (this.transform.b * this.transform.e -
          this.transform.a * this.transform.f) *
        invDet,
    };

    return transformPoint(point, inv);
  }
}

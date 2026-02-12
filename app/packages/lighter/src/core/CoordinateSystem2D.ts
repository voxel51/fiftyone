/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { CoordinateSystem, Rect, TransformMatrix } from "../types";

/**
 * 2D coordinate system implementation for transforming between relative [0,1] and absolute pixel coordinates.
 * Handles aspect ratio preservation and centering of canonical media.
 */
export class CoordinateSystem2D implements CoordinateSystem {
  private transform: TransformMatrix = {
    scaleX: 1,
    scaleY: 1,
    offsetX: 0,
    offsetY: 0,
  };

  /**
   * Convert relative coordinates [0,1] to absolute pixel coordinates.
   * @param relative - Rectangle in relative coordinates
   * @returns Rectangle in absolute pixel coordinates
   */
  relativeToAbsolute(relative: Rect): Rect {
    const { scaleX, scaleY, offsetX, offsetY } = this.transform;

    return {
      x: offsetX + relative.x * scaleX,
      y: offsetY + relative.y * scaleY,
      width: relative.width * scaleX,
      height: relative.height * scaleY,
    };
  }

  /**
   * Convert absolute pixel coordinates to relative coordinates [0,1].
   * @param absolute - Rectangle in absolute pixel coordinates
   * @returns Rectangle in relative coordinates
   */
  absoluteToRelative(absolute: Rect): Rect {
    const { scaleX, scaleY, offsetX, offsetY } = this.transform;

    // Avoid division by zero
    if (scaleX === 0 || scaleY === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    return {
      x: (absolute.x - offsetX) / scaleX,
      y: (absolute.y - offsetY) / scaleY,
      width: absolute.width / scaleX,
      height: absolute.height / scaleY,
    };
  }

  /**
   * Update the transformation matrix based on canonical media bounds.
   * @param mediaBounds - The rendered bounds of the canonical media
   */
  updateTransform(mediaBounds: Rect): void {
    // The transform maps from [0,1] coordinates to the rendered media bounds
    // Since relative coordinates are normalized to the original dimensions,
    // we scale by the rendered dimensions
    this.transform = {
      scaleX: mediaBounds.width,
      scaleY: mediaBounds.height,
      offsetX: mediaBounds.x,
      offsetY: mediaBounds.y,
    };
  }

  /**
   * Get the current transformation matrix.
   * @returns A copy of the current transform
   */
  getTransform(): TransformMatrix {
    return { ...this.transform };
  }

  /**
   * Reset the transformation to identity (no transformation).
   */
  reset(): void {
    this.transform = {
      scaleX: 1,
      scaleY: 1,
      offsetX: 0,
      offsetY: 0,
    };
  }
}

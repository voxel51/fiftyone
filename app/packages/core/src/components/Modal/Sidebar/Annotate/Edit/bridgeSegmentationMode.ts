/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Bridge for accessing segmentation mask state from non-React code
 * (e.g., SegmentationBrushHandler, InteractionManager).
 *
 * Selection and editing state are managed by Lighter's SelectionManager
 * and the annotation editing atom — not duplicated here.
 * This bridge only exposes segmentation-specific tool state.
 */

import { getDefaultStore } from "jotai";
import {
  _unsafeToolModeAtom,
  _unsafeToolAtom,
  _unsafeToolSizeAtom,
  _unsafeSegmentationModeActiveAtom,
  _unsafeToolShapeAtom,
  MIN_CURSOR_SIZE,
  MAX_CURSOR_SIZE,
} from "./useSegmentationMode";
import type {
  SegmentationToolMode,
  SegmentationTool,
  SegmentationToolShape,
  SegmentationToolState,
} from "./useSegmentationMode";

/**
 * Segmentation masks bridge for non-React code.
 * Provides read-only access to segmentation tool state.
 */
export const segmentationModeBridge = {
  /**
   * Whether segmentation mask mode is active.
   */
  isActive(): boolean {
    return getDefaultStore().get(_unsafeSegmentationModeActiveAtom);
  },

  /**
   * Current segmentation tool.
   */
  getActiveTool(): SegmentationTool {
    return getDefaultStore().get(_unsafeToolAtom);
  },

  /**
   * Current brush/eraser size in pixels.
   */
  getToolSize(): number {
    return getDefaultStore().get(_unsafeToolSizeAtom);
  },

  /**
   * Current brush shape.
   */
  getToolShape(): SegmentationToolShape {
    return getDefaultStore().get(_unsafeToolShapeAtom);
  },

  /**
   * Current paint mode (add to mask vs. remove from mask).
   */
  getToolMode(): SegmentationToolMode {
    return getDefaultStore().get(_unsafeToolModeAtom);
  },

  /**
   * Returns the full segmentation tool state.
   * @param scale - Viewport scale factor. `cursorSize` is the clamped
   *   screen-pixel size for the CSS cursor. `size` is the corresponding
   *   world-space value (`cursorSize / scale`) so the painted dab is
   *   always 1:1 with the visual cursor.
   */
  getToolState(scale = 1): SegmentationToolState {
    const cursorSize = Math.min(
      MAX_CURSOR_SIZE,
      Math.max(MIN_CURSOR_SIZE, Math.round(this.getToolSize() * scale))
    );

    return {
      active: this.isActive(),
      cursorSize,
      shape: this.getToolShape(),
      size: cursorSize / scale,
      tool: this.getActiveTool(),
      mode: this.getToolMode(),
    };
  },
};

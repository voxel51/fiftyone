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
  _unsafeToolAtom,
  _unsafeToolSizeAtom,
  _unsafeSegmentationModeActiveAtom,
  _unsafeToolShapeAtom,
} from "./useSegmentationMode";
import type {
  SegmentationTool,
  SegmentationToolShape,
  SegmentationToolState,
} from "./useSegmentationMode";

/**
 * Segmentation masks bridge for non-React code.
 * Provides read-only access to segmentation tool state.
 */
export const segmentationMasksBridge = {
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
   * Current brush/eraser tip shape.
   */
  getToolShape(): SegmentationToolShape {
    return getDefaultStore().get(_unsafeToolShapeAtom);
  },

  /**
   * Returns the full segmentation tool state
   * @param scale - Optional scale factor by which to multiply the tool size
   */
  getToolState(scale = 1): SegmentationToolState {
    return {
      active: this.isActive(),
      tool: this.getActiveTool(),
      size: this.getToolSize() * scale,
      shape: this.getToolShape(),
    };
  },
};

/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * Minimum zoom scale for Looker viewer.
 * Scale of 1.0 means the image fits within the viewport.
 * Values less than 1.0 would zoom out beyond the natural fit.
 */
export const MIN_ZOOM_SCALE = 1.0;

/**
 * Minimum zoom scale for Lighter viewer.
 * This value corresponds to MIN_ZOOM_SCALE (1.0) in Looker's coordinate system.
 * Lighter uses pixi-viewport which has a different scale interpretation.
 */
export const MIN_ZOOM_SCALE_LIGHTER = 0.8;

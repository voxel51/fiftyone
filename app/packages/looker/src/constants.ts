/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  CLASSIFICATION,
  CLASSIFICATIONS,
  REGRESSION,
  TEMPORAL_DETECTION,
  TEMPORAL_DETECTIONS,
} from "@fiftyone/utilities";

export const BASE_ALPHA = 0.7;
export const LINE_WIDTH = 3;
export const DASH_LENGTH = 8;
export const INFO_COLOR = "#ffffff";
export const SELECTED_AND_HOVERED_COLOR = "#ff6f61";
export const PAD = 4;
export const TOLERANCE = 1.15;
export const POINT_RADIUS = 4;
export const RADIUS = 12;
export const STROKE_WIDTH = 3;
export const FONT_SIZE = 16;
export const MIN_PIXELS = 16;
export const SCALE_FACTOR = 1.09;
export const CHUNK_SIZE = 30;
export const DATE_TIME = "DateTime";
export const MAX_FRAME_STREAM_SIZE = 5100;
export const MAX_FRAME_STREAM_SIZE_BYTES = 1e9;

export const POINTCLOUD_OVERLAY_PADDING = 100;

export const SELECTION_TEXT =
  "Click to select sample, Shift+Click to select a range";

export const MOMENT_CLASSIFICATIONS = [
  CLASSIFICATION,
  CLASSIFICATIONS,
  REGRESSION,
];

export const LABEL_TAGS_CLASSES = [
  CLASSIFICATION,
  CLASSIFICATIONS,
  REGRESSION,
  TEMPORAL_DETECTION,
  TEMPORAL_DETECTIONS,
];

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

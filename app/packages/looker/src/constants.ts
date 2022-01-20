/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import {
  CLASSIFICATION,
  CLASSIFICATIONS,
  REGRESSION,
  TEMPORAL_DETECTION,
  TEMPORAL_DETECTIONS,
} from "@fiftyone/utilities";
import { ImageFilter } from "./state";

export const BASE_ALPHA = 0.7;
export const LINE_WIDTH = 3;
export const DASH_LENGTH = 8;
export const INFO_COLOR = "#ffffff";
export const PAD = 4;
export const TOLERANCE = 1.15;
export const POINT_RADIUS = 4;
export const RADIUS = 12;
export const STROKE_WIDTH = 3;
export const FONT_SIZE = 16;
export const MIN_PIXELS = 16;
export const SCALE_FACTOR = 1.09;
export const MAX_FRAME_CACHE_SIZE_BYTES = 1e9;
export const CHUNK_SIZE = 20;
export const DATE_TIME = "DateTime";

export const SELECTION_TEXT =
  "Click to select sample, Shift+Click to select a range, Right click to expand";

export const JSON_COLORS = {
  keyColor: "rgb(138, 138, 138)",
  numberColor: "rgb(225, 100, 40)",
  stringColor: "rgb(238, 238, 238)",
  nullColor: "rgb(225, 100, 40)",
  trueColor: "rgb(225, 100, 40)",
  falseColor: "rgb(225, 100, 40)",
};

export const BIG_ENDIAN = (() => {
  let buf = new ArrayBuffer(4);
  let u32data = new Uint32Array(buf);
  let u8data = new Uint8Array(buf);
  u32data[0] = 0xcafebabe;
  return u8data[0] === 0xca;
})();

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

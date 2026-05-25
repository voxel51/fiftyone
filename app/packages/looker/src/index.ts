/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

export { createColorGenerator, getRGB } from "@fiftyone/utilities";
export * from "./cache";
export { freeVideos, getFrameNumber } from "./elements/util";
export * from "./lookers";
export * from "./overlays";
export * from "./selection";
export * from "./selective-rendering-events";
export type {
  BaseState,
  Coloring,
  CustomizeColor,
  FrameConfig,
  FrameOptions,
  ImageConfig,
  ImageOptions,
  KeypointSkeleton,
  LabelData,
  Point,
  Sample,
  VideoConfig,
  VideoOptions,
} from "./state";
export { zoomAspectRatio } from "./zoom";
export type RGB = [number, number, number];
export type RGBA = [number, number, number, number];

// CSS module class names for selection icons — reusable in React components
export {
  lookerCheckbox,
  lookerLabel,
  selectionIconCheckmark,
  selectionIconGreenCheckmark,
  selectionIconRedCheckmark,
  selectionIconThumbsup,
  selectionIconThumbsdown,
  selectionIconPin,
  selectionIconStar,
  selectionIconX,
  selectionIconBookmark,
} from "./elements/common/util.module.css";

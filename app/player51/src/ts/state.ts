/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

interface BaseOptions {
  activeLabels: string[];
  colorByLabel: boolean;
  filter: (label: { label?: string; confidence?: number }) => boolean;
  selectedLabels: string[];
  showAttrs: boolean;
  showConfidence: boolean;
  showTooltip: boolean;
}

export interface FrameOptions extends BaseOptions {}

export interface ImageOptions extends BaseOptions {}

export interface VideoOptions extends BaseOptions {
  useFrameNumber: boolean;
  autoplay: boolean;
  loop: boolean;
}

interface BaseConfig {
  thumbnail: boolean;
  src: string;
}

interface FrameConfig extends BaseConfig {
  frameRate: number;
}

interface ImageConfig extends BaseConfig {}

interface VideoConfig extends BaseConfig {
  frameRate: number;
}

export interface BaseState {
  cursorCoordinates?: [number, number];
  disableControls: boolean;
  focused: boolean;
  hovering: boolean;
  hoveringControls: boolean;
  showControls: boolean;
  showOptions: boolean;
  tooltipOverlay?: {
    color: string;
    field: string;
    frameNumber?: number;
    label: object;
    target?: number;
    type:
      | "Classification"
      | "Detection"
      | "Keypoint"
      | "Polyline"
      | "Segmentation";
  };
}

export interface FrameState extends BaseState {
  config: FrameConfig;
  options: FrameOptions;
}

export interface ImageState extends BaseState {
  config: ImageConfig;
  options: ImageOptions;
}

export interface VideoState extends BaseState {
  config: VideoConfig;
  options: VideoOptions;
}

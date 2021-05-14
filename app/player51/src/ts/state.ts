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
  zoomOn: string[] | [];
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
  dimentions: [number, number];
  canvasDimenstions: [number, number];
  disableControls: boolean;
  focused: boolean;
  loaded: boolean;
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
  seeking: boolean;
  playing: boolean;
  locked: boolean;
  fragment?: [number, number];
}

export type Optional<T> = {
  [P in keyof T]?: Optional<T[P]>;
};

export type ImageStateUpdate = Optional<ImageState>;

export type FrameStateUpdate = Optional<FrameState>;

export type VideoStateUpdate = Optional<VideoState>;

export enum Kind {
  Frame = "FRAME",
  Image = "Image",
  Video = "Video",
}

export const getKind = (mimeType: string): Kind => {
  // @todo: Kind.Frame
  if (mimeType.startsWith("video/")) {
    return Kind.Video;
  }
  return Kind.Image;
};

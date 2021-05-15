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
  onlyShowHoveredLabel: boolean;
  zoomOn: string[] | [];
}

export type Coordinates = [number, number];

export type Dimensions = [number, number];

export interface FrameOptions extends BaseOptions {
  useFrameNumber: boolean;
}

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

export interface TooltipOverlay {
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
}

export interface BaseState {
  cursorCoordinates: Coordinates;
  dimensions: Dimensions;
  canvasDimenstions: Dimensions;
  disableControls: boolean;
  focused: boolean;
  loaded: boolean;
  hovering: boolean;
  hoveringControls: boolean;
  showControls: boolean;
  showOptions: boolean;
  tooltipOverlay?: TooltipOverlay;
  config: BaseConfig;
  options: BaseOptions;
}

export interface FrameState extends BaseState {
  config: FrameConfig;
  options: FrameOptions;
  frameNumber: number;
  duration: number;
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
  frameNumber: number;
  duration: number;
  fragment?: [number, number];
}

export type Optional<T> = {
  [P in keyof T]?: Optional<T[P]>;
};

export enum Kind {
  Frame = "FRAME",
  Image = "Image",
  Video = "Video",
}

export type StateUpdate<State extends BaseState> = (
  stateOrUpdater:
    | Optional<State>
    | ((state: Readonly<State>) => Optional<State>)
) => void;

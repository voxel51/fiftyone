/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { Overlay } from "./overlays/base";

export interface BaseSample {
  metadata: {
    width: number;
    height: number;
  };
}

interface BaseOptions {
  activeLabels: string[];
  colorByLabel: boolean;
  filter: {
    [key: string]: (label: { label?: string; confidence?: number }) => boolean;
  } | null;
  colorMap: ((key: string | number | null | undefined) => string) | null;
  selectedLabels: string[];
  showLabel: boolean;
  showConfidence: boolean;
  showTooltip: boolean;
  onlyShowHoveredLabel: boolean;
  smoothMasks: boolean;
  hasNext: boolean;
  hasPrevious: boolean;
}

export type BoundingBox = [number, number, number, number];

export type Coordinates = [number, number];

export type Dimensions = [number, number];

interface BaseConfig {
  thumbnail: boolean;
  src: string;
  dimensions: Dimensions;
  sampleId: string;
}

export interface FrameConfig extends BaseConfig {
  frameRate: number;
  frameNumber: number;
}

export interface ImageConfig extends BaseConfig {}

export interface VideoConfig extends BaseConfig {
  frameRate: number;
  restPromise?: Promise<BaseSample>;
}

export interface FrameOptions extends BaseOptions {
  useFrameNumber: boolean;
  zoom: boolean;
  zoomPad: number;
}

export interface ImageOptions extends BaseOptions {
  zoom: boolean;
  zoomPad: number;
}

export interface VideoOptions extends BaseOptions {
  useFrameNumber: boolean;
  autoplay: boolean;
  loop: boolean;
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
  pixelCoordinates: Coordinates;
  disableControls: boolean;
  loaded: boolean;
  hovering: boolean;
  hoveringControls: boolean;
  showControls: boolean;
  showOptions: boolean;
  config: BaseConfig;
  options: BaseOptions;
  scale: number;
  pan: Coordinates;
  panning: boolean;
  rotate: number;
  canZoom: boolean;
  strokeWidth: number;
  fontSize: number;
  wheeling: boolean;
  windowBBox: BoundingBox;
  transformedWindowBBox: BoundingBox;
  mediaBBox: BoundingBox;
  transformedMediaBBox: BoundingBox;
  canvasBBox: BoundingBox;
  textPad: number;
  fullscreen: boolean;
  pointRadius: number;
  relativeCoordinates: Coordinates;
  mouseIsOnOverlay: boolean;
  showHelp: boolean;
  overlaysPrepared: boolean;
}

export interface FrameState extends BaseState {
  config: FrameConfig;
  options: FrameOptions;
  duration: number | null;
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
  buffering: boolean;
  hasReader: boolean;
}

export type Optional<T> = {
  [P in keyof T]?: Optional<T[P]>;
};

export type StateUpdate<State extends BaseState> = (
  stateOrUpdater:
    | Optional<State>
    | ((state: Readonly<State>) => Optional<State>),
  postUpdate?: (
    state: Readonly<State>,
    overlays: Readonly<Overlay<State>[]>
  ) => void
) => void;

const DEFAULT_BASE_OPTIONS = {
  activeLabels: [],
  colorByLabel: false,
  selectedLabels: [],
  showLabel: false,
  showConfidence: false,
  showTooltip: false,
  onlyShowHoveredLabel: false,
  filter: null,
  colorMap: null,
  smoothMasks: true,
  hasNext: false,
  hasPrevious: false,
};

export const DEFAULT_FRAME_OPTIONS = {
  ...DEFAULT_BASE_OPTIONS,
  useFrameNumber: true,
  zoom: false,
  zoomPad: 0.1,
};

export const DEFAULT_IMAGE_OPTIONS = {
  ...DEFAULT_BASE_OPTIONS,
  zoom: false,
  zoomPad: 0.1,
};

export const DEFAULT_VIDEO_OPTIONS = {
  ...DEFAULT_BASE_OPTIONS,
  useFrameNumber: false,
  autoplay: false,
  loop: false,
};

export interface FrameSample {
  [key: string]: any;
  frame_number: number;
}

export interface VideoSample extends BaseSample {
  frames: { 1?: FrameSample };
}

export interface FrameChunk {
  frames: FrameSample[];
  range: [number, number];
}

export interface FrameChunkResponse extends FrameChunk {
  uuid: string;
  method: string;
}

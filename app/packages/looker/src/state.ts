/**
 * Copyright 2017-2023, Voxel51, Inc.
 */

import { Overlay } from "./overlays/base";

import { AppError, Schema, Stage } from "@fiftyone/utilities";

// vite won't import these from fou
export type RGB = [number, number, number];
export type RGBA = [number, number, number, number];
export interface Coloring {
  by: "field" | "value";
  pool: readonly string[];
  scale: RGB[];
  seed: number;
  defaultMaskTargets?: MaskTargets;
  maskTargets: {
    [field: string]: MaskTargets;
  };
  points: boolean;
  targets: string[];
}
export interface CustomizeColor {
  path: string;
  fieldColor?: string;
  colorByAttribute?: string;
  // attributeForOpacity?: string;
  valueColors?: {
    value: string;
    color: string;
  }[];
}

export type OrthogrpahicProjectionMetadata = {
  _id: string;
  _cls: "OrthographicProjectionMetadata";
  filepath: string;
  height: number;
  width: number;
  min_bound: [number, number];
  max_bound: [number, number];
};

export type GenericLabel = {
  [labelKey: string]:
    | {
        _cls: string;
        [field: string]: unknown;
      }
    | OrthogrpahicProjectionMetadata;
  // todo: add other label types
};

export type Sample = {
  metadata: {
    width: number;
    height: number;
    mime_type?: string;
  };
  id: string;
  filepath: string;
  tags: string[];
  _label_tags: string[];
  _media_type: "image" | "video" | "point-cloud";
} & GenericLabel;

export interface LabelData {
  labelId: string;
  field: string;
  frameNumber?: number;
  sampleId: string;
  index?: number;
}

type MaskLabel = string;
export type IntMaskTargets = {
  [intKey: string]: MaskLabel;
};

type HexColor = string;

export type RgbMaskTargets = {
  [hexKey: HexColor]: {
    label: MaskLabel;
    intTarget: number;
  };
};
export type MaskTargets = IntMaskTargets | RgbMaskTargets;

export type BufferRange = [number, number];
export type Buffers = BufferRange[];

export type DispatchEvent = (eventType: string, details?: any) => void;

export type Action<State extends BaseState> = (
  update: StateUpdate<State>,
  dispatchEvent: DispatchEvent,
  eventKey?: string,
  shiftKey?: boolean
) => void;

export enum ControlEventKeyType {
  HOLD,
  KEY_DOWN,
}
export interface Control<State extends BaseState = BaseState> {
  eventKeys?: string | string[];
  eventKeyType?: ControlEventKeyType;
  filter?: (config: Readonly<State["config"]>) => boolean;
  title: string;
  shortcut: string;
  detail: string;
  action: Action<State>;
  afterAction?: Action<State>;
  alwaysHandle?: boolean;
}

export interface ControlMap<State extends BaseState> {
  [key: string]: Control<State>;
}

export interface KeypointSkeleton {
  labels: string[];
  edges: number[][];
}

interface BaseOptions {
  highlight: boolean;
  activePaths: string[];
  filter: (path: string, value: unknown) => boolean;
  coloring: Coloring;
  customizeColorSetting: CustomizeColor[];
  selectedLabels: string[];
  attributeVisibility: object;
  showConfidence: boolean;
  showControls: boolean;
  showIndex: boolean;
  showJSON: boolean;
  showHelp: boolean;
  showLabel: boolean;
  showOverlays: boolean;
  showTooltip: boolean;
  onlyShowHoveredLabel: boolean;
  smoothMasks: boolean;
  fullscreen: boolean;
  zoomPad: number;
  selected: boolean;
  inSelectionMode: boolean;
  timeZone: string;
  mimetype: string;
  alpha: number;
  defaultSkeleton?: KeypointSkeleton;
  skeletons: { [key: string]: KeypointSkeleton };
  showSkeletons: boolean;
  isPointcloudDataset: boolean;
  pointFilter: (path: string, point: Point) => boolean;
  thumbnailTitle?: (sample: any) => string;
}

export type BoundingBox = [number, number, number, number];

export type Coordinates = [number, number];

export type Dimensions = [number, number];

export interface BaseConfig {
  thumbnail: boolean;
  src: string;
  sources: { [path: string]: string };
  sampleId: string;
  fieldSchema: Schema;
  view: Stage[];
  dataset: string;
  group?: {
    id: string;
    name: string;
  };
}

export interface FrameConfig extends BaseConfig {
  frameRate: number;
  frameNumber: number;
}

export type ImageConfig = BaseConfig;

export interface VideoConfig extends BaseConfig {
  frameRate: number;
  support?: [number, number];
}

export type PcdConfig = BaseConfig;

export interface FrameOptions extends BaseOptions {
  useFrameNumber: boolean;
  zoom: boolean;
}

export interface ImageOptions extends BaseOptions {
  zoom: boolean;
}

export interface VideoOptions extends BaseOptions {
  autoplay: boolean;
  loop: boolean;
  playbackRate: number;
  useFrameNumber: boolean;
  volume: number;
}

export type PcdOptions = BaseOptions;

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
  disabled: boolean;
  dimensions?: Dimensions;
  cursorCoordinates: Coordinates;
  pixelCoordinates: Coordinates;
  disableControls: boolean;
  loaded: boolean;
  hovering: boolean;
  hoveringControls: boolean;
  showOptions: boolean;
  config: BaseConfig;
  options: BaseOptions;
  scale: number;
  pan: Coordinates;
  panning: boolean;
  rotate: number;
  strokeWidth: number;
  fontSize: number;
  wheeling: boolean;
  windowBBox: BoundingBox;
  transformedWindowBBox: BoundingBox;
  mediaBBox: BoundingBox;
  transformedMediaBBox: BoundingBox;
  canvasBBox: BoundingBox;
  textPad: number;
  pointRadius: number;
  dashLength: number;
  relativeCoordinates: Coordinates;
  mouseIsOnOverlay: boolean;
  overlaysPrepared: boolean;
  disableOverlays: boolean;
  zoomToContent: boolean;
  setZoom: boolean;
  hasDefaultZoom: boolean;
  SHORTCUTS: Readonly<ControlMap<any>>; // fix me,
  error: boolean | number | AppError;
  destroyed: boolean;
  reloading: boolean;
}

export interface FrameState extends BaseState {
  config: FrameConfig;
  options: FrameOptions;
  duration: number | null;
  SHORTCUTS: Readonly<ControlMap<FrameState>>;
}

export interface ImageState extends BaseState {
  config: ImageConfig;
  options: ImageOptions;
  SHORTCUTS: Readonly<ControlMap<ImageState>>;
}

export interface VideoState extends BaseState {
  config: VideoConfig;
  options: VideoOptions;
  seeking: boolean;
  playing: boolean;
  frameNumber: number;
  duration: number | null;
  fragment: [number, number] | null;
  buffering: boolean;
  buffers: Buffers;
  seekBarHovering: boolean;
  SHORTCUTS: Readonly<ControlMap<VideoState>>;
  hasPoster: boolean;
  waitingForVideo: boolean;
  lockedToSupport: boolean;
}

export interface PcdState extends BaseState {
  config: PcdConfig;
  options: PcdOptions;
  SHORTCUTS: Readonly<ControlMap<PcdState>>;
}

export type Optional<T> = {
  [P in keyof T]?: Optional<T[P]>;
};

export interface Point {
  point: [number | NONFINITE, number | NONFINITE];
  label: string;
  [key: string]: any;
}

export type NONFINITE = "-inf" | "inf" | "nan";

export type StateUpdate<State extends BaseState> = (
  stateOrUpdater:
    | Optional<State>
    | ((state: Readonly<State>) => Optional<State>),
  postUpdate?: (
    state: Readonly<State>,
    overlays: Readonly<Overlay<State>[]>,
    sample: object
  ) => void
) => void;

const DEFAULT_BASE_OPTIONS: BaseOptions = {
  highlight: false,
  activePaths: [],
  selectedLabels: [],
  showConfidence: false,
  showControls: true,
  showIndex: false,
  showJSON: false,
  showLabel: false,
  showTooltip: false,
  onlyShowHoveredLabel: false,
  filter: null,
  coloring: {
    by: "field",
    points: true,
    pool: ["#000000"],
    scale: null,
    seed: 0,
    maskTargets: {},
    defaultMaskTargets: null,
    targets: ["#000000"],
  },
  customizeColorSetting: [],
  smoothMasks: true,
  fullscreen: false,
  zoomPad: 0.2,
  selected: false,
  inSelectionMode: false,
  timeZone: "UTC",
  mimetype: "",
  alpha: 0.7,
  defaultSkeleton: null,
  skeletons: {},
  showSkeletons: true,
  showOverlays: true,
  pointFilter: (path: string, point: Point) => true,
};

export const DEFAULT_FRAME_OPTIONS: FrameOptions = {
  ...DEFAULT_BASE_OPTIONS,
  useFrameNumber: true,
  zoom: false,
};

export const DEFAULT_IMAGE_OPTIONS: ImageOptions = {
  ...DEFAULT_BASE_OPTIONS,
  zoom: false,
};

export const DEFAULT_VIDEO_OPTIONS: VideoOptions = {
  ...DEFAULT_BASE_OPTIONS,
  autoplay: false,
  loop: false,
  playbackRate: 1,
  useFrameNumber: false,
  volume: 0,
};

export const DEFAULT_PCD_OPTIONS: PcdOptions = {
  ...DEFAULT_BASE_OPTIONS,
};

export interface FrameSample {
  [key: string]: any;
  frame_number: number;
}

export interface VideoSample extends Sample {
  frames: [FrameSample];
}

export interface FrameChunk {
  frames: FrameSample[];
  range: [number, number];
}

export interface FrameChunkResponse extends FrameChunk {
  uuid: string;
  method: string;
  frames: FrameSample[];
  range: [number, number];
  error?: boolean;
}

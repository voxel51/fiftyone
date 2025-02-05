/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { BufferManager } from "@fiftyone/utilities";
import { ImaVidFramesController } from "./lookers/imavid/controller";
import { Overlay } from "./overlays/base";

import { AppError, COLOR_BY, Schema, Stage } from "@fiftyone/utilities";

export type Optional<T> = {
  [P in keyof T]?: Optional<T[P]>;
};

// vite won't import these from fou
export type RGB = [number, number, number];
export type RGBA = [number, number, number, number];
export interface Coloring {
  by: COLOR_BY.FIELD | COLOR_BY.INSTANCE | COLOR_BY.VALUE;
  pool: readonly string[];
  scale: RGB[];
  seed: number;
  defaultMaskTargets?: MaskTargets;
  defaultMaskTargetsColors: MaskColorInput[];
  maskTargets: {
    [field: string]: MaskTargets;
  };
  points: boolean;
  targets: string[];
}

export type ColorscaleInput = {
  path?: string;
  name?: string;
  list?: [];
  rgb?: [RGB[]];
};

export type Colorscale = {
  fields: ColorscaleInput[];
  default: ColorscaleInput;
};

export type MaskColorInput = {
  intTarget: number;
  color: string;
};

export interface LabelTagColor {
  fieldColor?: string;
  valueColors?: {
    value: string;
    color: string;
  }[];
}

export interface CustomizeColor extends LabelTagColor {
  path: string;
  colorByAttribute?: string;
  maskTargetsColors?: MaskColorInput[];
}

export type OrthogrpahicProjectionMetadata = {
  _id: string;
  filepath: string;
  height: number;
  width: number;
  min_bound: [number, number, number];
  max_bound: [number, number, number];
  normal: [number, number, number];
};

export type GenericLabel = {
  [labelKey: string]: {
    [field: string]: unknown;
  };
  // todo: add other label types
};

export type Sample = {
  metadata: {
    width: number;
    height: number;
    mime_type?: string;
  };
  _id: string;
  id: string;
  filepath: string;
  frames?: Sample[];
  tags: string[];
  _label_tags: string[];
  _media_type: "image" | "video" | "point-cloud" | "3d";
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
export type Buffers = Readonly<BufferRange>[];

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
  fontSize?: number;
  filter: (path: string, value: unknown) => boolean;
  coloring: Coloring;
  customizeColorSetting: CustomizeColor[];
  colorscale: Colorscale;
  labelTagColors: CustomizeColor;
  selectedLabels: string[];
  selectedLabelTags?: string[];
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
  zoomPad: number;
  selected: boolean;
  shouldHandleKeyEvents?: boolean;
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
  mediaFallback: boolean;
}

export type BoundingBox = [number, number, number, number];

export type Coordinates = [number, number];

export type Dimensions = [number, number];

export interface BaseConfig {
  mediaField: string;
  thumbnail: boolean;
  src: string;
  sources: { [path: string]: string };
  sampleId: string;
  symbol: symbol;
  fieldSchema: Schema;
  isDynamicGroup: boolean;
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
  enableTimeline: boolean;
  frameRate: number;
  support?: [number, number];
}

export interface ImaVidConfig extends BaseConfig {
  /**
   * number of frames-per-second.
   * this number is suggestive rather than authoritative,
   * which is why we hide it from the user.
   */
  frameRate: number;
  /**
   * "C"ontroller for [ImaVidStore](./lookers/imavid/store.ts)
   */
  frameStoreController: ImaVidFramesController;
  firstFrameNumber: number;
}

export interface ThreeDConfig extends BaseConfig {
  /**
   * whether or not orthographic projection metada is available for this 3D sample
   */
  isOpmAvailable: boolean;
  /**
   * whether or not the 3D sample is a fo3d sample
   */
  isFo3d: boolean;
}

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

export interface ImaVidOptions extends BaseOptions {
  loop: boolean;
  playbackRate: number;
}

export type ThreeDOptions = BaseOptions;

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
  buffers: Buffers;
  config: VideoConfig;
  options: VideoOptions;
  seeking: boolean;
  playing: boolean;
  frameNumber: number;
  duration: number | null;
  fragment: [number, number] | null;
  buffering: boolean;
  seekBarHovering: boolean;
  SHORTCUTS: Readonly<ControlMap<VideoState>>;
  hasPoster: boolean;
  waitingForVideo: boolean;
  waitingToStream: boolean;
  lockedToSupport: boolean;
}

export interface ImaVidState extends BaseState {
  /**
   * parameters for imavid looker (comes from [`useCreateLooker()`](../../state/src/hooks/useCreateLooker.ts))
   */
  config: ImaVidConfig;
  /**
   * user configurable options for video player
   * @see [Configuring FiftyOne](https://docs.voxel51.com/user_guide/config.html#configuring-the-app)
   */
  options: ImaVidOptions;
  /**
   * true if seeking, i.e. either seek thumb or bar is being clicked / dragged
   */
  seeking: boolean;
  /**
   * true if playing, false if paused
   */
  playing: boolean;
  /**
   * current frame number
   */
  currentFrameNumber: number;
  /**
   * total number of frames
   */
  totalFrames: number;
  /**
   * true if frames are buffering from server
   */
  buffering: boolean;
  /**
   * ranges of frame numbers that have been buffered.
   */
  bufferManager: BufferManager;
  /**
   * true if the seek bar is being hovered
   */
  seekBarHovering: boolean;
}

export interface ThreeDState extends BaseState {
  config: ThreeDConfig;
  options: ThreeDOptions;
  SHORTCUTS: Readonly<ControlMap<ThreeDState>>;
}

export interface Point {
  point: [number | NONFINITE, number | NONFINITE];
  label: string;
  [key: string]: any;
}

export type NONFINITE = "-inf" | "inf" | "nan";

export type StateUpdate<State extends BaseState> = (
  stateOrUpdater: Optional<State> | ((previousState: State) => Optional<State>),
  postUpdate?: (
    state: Readonly<State>,
    overlays: Readonly<Overlay<State>[]>,
    sample: object
  ) => void
) => void;

export const DEFAULT_BASE_OPTIONS: BaseOptions = {
  highlight: false,
  isPointcloudDataset: false,
  activePaths: [],
  selectedLabels: [],
  selectedLabelTags: undefined,
  showConfidence: false,
  showControls: true,
  showIndex: false,
  showJSON: false,
  showHelp: false,
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
  attributeVisibility: {},
  mediaFallback: false,
  shouldHandleKeyEvents: true,
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

export const DEFAULT_3D_OPTIONS: ThreeDOptions = {
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

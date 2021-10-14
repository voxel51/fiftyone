/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { Overlay } from "./overlays/base";

export interface Sample {
  metadata: {
    width: number;
    height: number;
  };
  id: string;
  media_type: "image" | "image";
  filepath: string;
  tags: string[];
  _label_tags: string[];
}

export interface LabelData {
  label_id: string;
  field: string;
  frame_number?: number;
  sample_id: string;
  index?: number;
}

export type BufferRange = [number, number];
export type Buffers = BufferRange[];

export type DispatchEvent = (eventType: string, details?: any) => void;

export type Action<State extends BaseState> = (
  update: StateUpdate<State>,
  dispatchEvent: DispatchEvent,
  eventKey?: string,
  shiftKey?: boolean
) => void;

export interface Control<State extends BaseState = BaseState> {
  eventKeys?: string | string[];
  filter?: (config: Readonly<State["config"]>) => boolean;
  title: string;
  shortcut: string;
  detail: string;
  action: Action<State>;
}

export interface ControlMap<State extends BaseState> {
  [key: string]: Control<State>;
}

interface BaseOptions {
  activePaths: string[];
  colorByLabel: boolean;
  filter: {
    [key: string]: (label: { label?: string; confidence?: number }) => boolean;
  };
  colorMap: (key: string | number | null | undefined) => string;
  selectedLabels: string[];
  showConfidence: boolean;
  showIndex: boolean;
  showJSON: boolean;
  showLabel: boolean;
  showTooltip: boolean;
  onlyShowHoveredLabel: boolean;
  smoothMasks: boolean;
  hasNext: boolean;
  hasPrevious: boolean;
  fullscreen: boolean;
  zoomPad: number;
  selected: boolean;
  fieldsMap?: { [key: string]: string };
  inSelectionMode: boolean;
  mimetype: string;
}

export type BoundingBox = [number, number, number, number];

export type Coordinates = [number, number];

export type Dimensions = [number, number];

interface SchemaEntry {
  name: string;
  ftype: string;
  subfield?: string;
  embedded_doc_type?: string;
  db_field: string;
}

interface Schema {
  [name: string]: SchemaEntry;
}

interface BaseConfig {
  thumbnail: boolean;
  src: string;
  dimensions: Dimensions;
  sampleId: string;
  fieldSchema: Schema;
}

export interface FrameConfig extends BaseConfig {
  frameRate: number;
  frameNumber: number;
}

export interface ImageConfig extends BaseConfig {}

export interface VideoConfig extends BaseConfig {
  frameRate: number;
  support?: [number, number];
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
  frameFieldsMap?: { [key: string]: string };
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
  showHelp: boolean;
  overlaysPrepared: boolean;
  disableOverlays: boolean;
  zoomToContent: boolean;
  setZoom: boolean;
  hasDefaultZoom: boolean;
  SHORTCUTS: Readonly<ControlMap<any>>; // fix me,
  error: boolean;
  destroyed: boolean;
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

const DEFAULT_BASE_OPTIONS: BaseOptions = {
  activePaths: [],
  colorByLabel: false,
  selectedLabels: [],
  showConfidence: false,
  showIndex: false,
  showJSON: false,
  showLabel: false,
  showTooltip: false,
  onlyShowHoveredLabel: false,
  filter: null,
  colorMap: null,
  smoothMasks: true,
  hasNext: false,
  hasPrevious: false,
  fullscreen: false,
  zoomPad: 0.1,
  selected: false,
  fieldsMap: {},
  inSelectionMode: false,
  mimetype: "",
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
  frameFieldsMap: {},
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
}

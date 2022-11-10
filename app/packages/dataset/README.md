# Looker

Looker is a client-side JavaScript media viewer that can render label overlays

# Features

- Media support: Image, Video
- Media loading via proxy
- Zoom / Pan (aka Orthographic Camera Controls)
- Crop / Crop to selected
- Fullscreen
- Display Sample as JSON
- Escape Context + Modal Closing
- Prev / Next Sample
- Label rotation
- [Video] play/pause, seek, prev/next frame
- Label Rendering
  - Classification
  - Detection
  - Keypoint
  - Polyline
  - Segmentation
- Label Selection
- [Video] Frame Labels
- Tooltip w/ label fields
- External State Management
  - Allows other components to update its state
  - Used for filtering / sidebar integration

# Approach / Nuances

- Vanilla DOM Elements + Events
- Dynamically attached to an empty React rendered element
- Canvas
- Bespoke internal state management
  - Allows for hooks in react to call `looker.updateOptions()` and similar
- Requires wrapping react code to mediate recoil hooks
- Duplicates recoil state

# State

| Atom             | Used In                                  |
| :--------------- | :--------------------------------------- |
| sampleId         | looker                                   |
| dimensions       | looker                                   |
| hasNext          | looker                                   |
| hasPrevious      | looker                                   |
| selectedLabelIds | looker                                   |
| showoverlays     | looker                                   |
| modal            | looker, options, SampleModal             |
| isPatchesView    | looker, flashlight                       |
| cropToContent    | looker, flashlight                       |
| activeFields     | looker, flashlight, groupEntries, schema |
| pathFilter       | looker, flashlight                       |
| fullscreen       | looker, menu, samplemodal                |
| timeZone         | global                                   |
| coloring         | global                                   |
| alpha            | flashlight, looker, options              |
| showSkeletons    | global                                   |
| defaultSkeleton  | global                                   |
| skeletons        | global                                   |
| pointFilter      | looker, flashlight                       |
| selectedLabels   | global                                   |
| thumbnail        | flashlight, looker                       |
| frameRate        | flashlight, looker                       |
| frameNumber      | flashlight, looker                       |
| fieldSchema      | global                                   |

# Internal State

```ts
export interface BaseState {
  disabled: boolean;
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
  showHelp: boolean;
  overlaysPrepared: boolean;
  disableOverlays: boolean;
  zoomToContent: boolean;
  setZoom: boolean;
  hasDefaultZoom: boolean;
  SHORTCUTS: Readonly<ControlMap<any>>; // fix me,
  error: boolean | number;
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
```

# Questions

- Why are there so many ways to update state?

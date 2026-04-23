/** Axis-aligned bounds for one render-ready 3D scene frame. */
export type Points3dBounds = {
  min: [number, number, number];
  max: [number, number, number];
};

/** One labeled metadata row for a semantic 3D hover card. */
export type Scene3dPrimitiveSemanticEntry = {
  label: string;
  value: string;
};

/** Semantic hover metadata for an interactive 3D primitive. */
export type Scene3dPrimitiveSemantic = {
  title: string;
  entries: Scene3dPrimitiveSemanticEntry[];
};

type Scene3dPrimitiveBase = {
  id: string;
  frameId?: string | null;
  semantic?: Scene3dPrimitiveSemantic | null;
};

/** One render-ready points primitive within a 3D scene frame. */
export type Scene3dPointsPrimitive = Scene3dPrimitiveBase & {
  kind: "points";
  pointCount: number;
  positions: Float32Array;
  intensity: Float32Array | null;
  colors?: Float32Array | null;
  pointSize?: number | null;
  solidColor?: string | null;
};

/** One render-ready line primitive within a 3D scene frame. */
export type Scene3dLinePrimitive = Scene3dPrimitiveBase & {
  kind: "line-list" | "line-strip";
  positions: Float32Array;
  colors?: Float32Array | null;
  solidColor?: string | null;
};

/** One render-ready instanced glyph primitive within a 3D scene frame. */
export type Scene3dInstancePrimitive = Scene3dPrimitiveBase & {
  kind: "sphere-list" | "cube-list";
  positions: Float32Array;
  scales: Float32Array;
  rotations?: Float32Array | null;
  colors?: Float32Array | null;
  solidColor?: string | null;
};

/** One render-ready primitive within a transport-agnostic 3D scene frame. */
export type Scene3dPrimitive =
  | Scene3dPointsPrimitive
  | Scene3dLinePrimitive
  | Scene3dInstancePrimitive;

/** One render-ready 3D scene frame for the transport-agnostic `3d` archetype. */
export type Scene3dFrame = {
  id: string;
  pointCount: number;
  primitives: Scene3dPrimitive[];
  bounds: Points3dBounds;
  frameId?: string | null;
};

/** Visual props for the transport-agnostic `points3d` archetype. */
export type Points3dViewProps = {
  frame: Scene3dFrame | null;
  colorMode?: "intensity" | "rgb" | "solid";
  solidColor?: string;
  backgroundColor?: string;
  upAxis?: "x" | "y" | "z";
  showGrid?: boolean;
  followPose?: {
    position: [number, number, number];
    orientation?: [number, number, number, number] | null;
  } | null;
  resetViewToken?: string | number;
  preserveViewOnFrameChange?: boolean;
};

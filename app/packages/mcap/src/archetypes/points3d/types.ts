/** Axis-aligned bounds for one render-ready 3D point frame. */
export type Points3dBounds = {
  min: [number, number, number];
  max: [number, number, number];
};

/** One render-ready 3D point frame for a transport-agnostic archetype. */
export type Points3dFrame = {
  id: string;
  pointCount: number;
  positions: Float32Array;
  intensity: Float32Array | null;
  bounds: Points3dBounds;
};

/** Visual props for the transport-agnostic `points3d` archetype. */
export type Points3dViewProps = {
  frame: Points3dFrame | null;
  colorMode?: "intensity" | "solid";
  solidColor?: string;
  resetViewToken?: string | number;
  preserveViewOnFrameChange?: boolean;
};

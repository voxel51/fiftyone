import type { Overlay3DDocument, OverlayLabel } from "../labels/loader";

export type {
  ToolbarActionItem,
  ToolbarActionGroup,
} from "@fiftyone/components";

export interface AnnotationToolbarProps {
  className?: string;
}

// Hover state for specific polyline points/segments
export interface HoveredPolylineInfo {
  labelId: string;
  segmentIndex: number;
  // undefined means hovering over the segment, not a specific point
  pointIndex?: number;
}

// Transform control state
export type TransformMode = "translate" | "rotate" | "scale";
export type TransformSpace = "world" | "local";

export interface Spatial {
  position: [number, number, number];
  quaternion?: [number, number, number, number];
}

export interface SelectedPoint {
  labelId: string;
  segmentIndex: number;
  pointIndex: number;
}

// Polyline segment transformations - stores modified segments for each label
// Each segment is a list of connected vertices
// Segments are stored in an array where the index IS the segmentIndex
export interface PolylineSegmentTransform {
  // All vertices in this segment (connected)
  points: [number, number, number][];
}

export interface PolylinePointTransformData {
  segments: PolylineSegmentTransform[];
  path?: string;
  sampleId?: string;
  label?: string;
  misc?: Record<string, unknown>;
}

export interface SegmentState {
  isActive: boolean;
  isClosed: boolean;
  currentMousePosition: [number, number, number] | null;
  vertices: [number, number, number][];
}

export interface PolylineTransformData {
  points3d: [number, number, number][][];
  closed?: boolean;
}

export interface CuboidTransformData {
  location: [number, number, number];
  dimensions: [number, number, number];
  rotation?: [number, number, number];
  quaternion?: [number, number, number, number];
}

export interface AnnotationPlaneState {
  enabled: boolean;
  position: [number, number, number];
  quaternion: [number, number, number, number];
  showX: boolean;
  showY: boolean;
  showZ: boolean;
}

/**
 * The persistable document of a reconciled 3D detection: the sample's label
 * data merged with staged geometry. Everything here — and ONLY this — is
 * committed to the engine and the sample.
 */
export type Detection3DDocument = Overlay3DDocument &
  CuboidTransformData & {
    _cls: "Detection";
  };

/**
 * The persistable document of a reconciled 3D polyline.
 */
export type Polyline3DDocument = Overlay3DDocument &
  PolylineTransformData & {
    _cls: "Polyline";
    closed?: boolean;
    filled?: boolean;
  };

/**
 * A reconciled detection that combines raw overlay data from sample with staged transforms.
 * This represents the authoritative state of a 3D detection that will be rendered.
 * Shape follows {@link OverlayLabel}: document under `data`, view state under `ui`.
 */
export type ReconciledDetection3D = Omit<OverlayLabel, "data"> & {
  data: Detection3DDocument;
};

/**
 * A reconciled polyline that combines raw overlay data from sample with staged transforms.
 * This represents the authoritative state of a 3D polyline that will be rendered.
 * Shape follows {@link OverlayLabel}: document under `data`, view state under `ui`.
 */
export type ReconciledPolyline3D = Omit<OverlayLabel, "data"> & {
  data: Polyline3DDocument;
};

/**
 * Container for reconciled 3D label data.
 */
export interface ReconciledLabels3D {
  detections: ReconciledDetection3D[];
  polylines: ReconciledPolyline3D[];
}

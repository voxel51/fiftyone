import { ReactNode } from "react";
import type { OverlayLabel } from "../labels/loader";

export interface AnnotationAction {
  id: string;
  label: string;
  icon: ReactNode;
  shortcut?: string;
  tooltip?: string | ReactNode;
  isActive?: boolean;
  isDisabled?: boolean;
  isVisible?: boolean;
  onClick: () => void;
  customComponent?: ReactNode;
}

export interface AnnotationActionGroup {
  id: string;
  label?: string;
  isHidden?: boolean;
  actions: AnnotationAction[];
}

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
 * Base properties shared by all reconciled 3D labels.
 */
interface ReconciledLabelBase3D {
  /** True if this label only exists in staged transforms (newly created) */
  isNew?: boolean;
  label?: string;
}

/**
 * A reconciled detection that combines raw overlay data from sample with staged transforms.
 * This represents the authoritative state of a 3D detection that will be rendered.
 */
export type ReconciledDetection3D = Omit<OverlayLabel, "selected"> &
  CuboidTransformData &
  ReconciledLabelBase3D & {
    _cls: "Detection";
    _id: string;
    path: string;
  } & Record<string, unknown>;

/**
 * A reconciled polyline that combines raw overlay data from sample with staged transforms.
 * This represents the authoritative state of a 3D polyline that will be rendered.
 */
export type ReconciledPolyline3D = Omit<OverlayLabel, "selected"> &
  ReconciledLabelBase3D &
  PolylineTransformData & {
    _cls: "Polyline";
    _id: string;
    path: string;
    closed?: boolean;
  } & Record<string, unknown>;

/**
 * Container for reconciled 3D label data.
 */
export interface ReconciledLabels3D {
  detections: ReconciledDetection3D[];
  polylines: ReconciledPolyline3D[];
}

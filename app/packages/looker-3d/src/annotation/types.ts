import { ReactNode } from "react";

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

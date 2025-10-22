import { ReactNode } from "react";

export interface AnnotationAction {
  id: string;
  label: string;
  icon: ReactNode;
  shortcut?: string;
  tooltip?: string;
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

// Transform data for HUD display
export interface TransformData {
  // Delta X
  dx?: number;
  // Delta Y
  dy?: number;
  // Delta Z
  dz?: number;
  // Absolute world position X
  x?: number;
  // Absolute world position Y
  y?: number;
  // Absolute world position Z
  z?: number;
  // Dimensions X
  dimensionX?: number;
  // Dimensions Y
  dimensionY?: number;
  // Dimensions Z
  dimensionZ?: number;
  // Local rotation X (in degrees)
  rotationX?: number;
  // Local rotation Y (in degrees)
  rotationY?: number;
  // Local rotation Z (in degrees)
  rotationZ?: number;
}

// Transformed label data storage
export interface TransformedLabelData {
  worldPosition: [number, number, number];
  dimensions: [number, number, number];
  localRotation: [number, number, number];
  worldRotation: [number, number, number];
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
  path: string;
  sampleId: string;
}

export interface SegmentState {
  isActive: boolean;
  isClosed: boolean;
  currentMousePosition: [number, number, number] | null;
  vertices: [number, number, number][];
}

export interface AnnotationPlaneState {
  enabled: boolean;
  position: [number, number, number];
  quaternion: [number, number, number, number];
  showX: boolean;
  showY: boolean;
  showZ: boolean;
}

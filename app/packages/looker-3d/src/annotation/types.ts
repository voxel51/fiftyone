import { ReactNode } from "react";
import * as THREE from "three";

/**
 * Represents an action item in the annotation toolbar.
 * Actions can be buttons, toggles, or custom components that perform
 * annotation-related operations in the 3D viewer.
 */
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

/**
 * Groups can be shown or hidden, and are used to organize
 * annotation tools by functionality.
 */
export interface AnnotationActionGroup {
  id: string;
  label?: string;
  isHidden?: boolean;
  actions: AnnotationAction[];
}

/**
 * Props for the annotation toolbar component that displays
 * available annotation actions and their groups.
 */
export interface AnnotationToolbarProps {
  className?: string;
}

/**
 * Transform mode for manipulating 3D objects.
 * Controls which type of transformation is active (translation, rotation, or scaling).
 */
export type TransformMode = "translate" | "rotate" | "scale";

/**
 * Coordinate space for transformations.
 * Determines whether transformations are applied in world space or local object space.
 */
export type TransformSpace = "world" | "local";

/**
 * Spatial positioning data for 3D objects.
 * Contains position and optional rotation (quaternion) information.
 */
export interface Spatial {
  position: [number, number, number];
  quaternion?: [number, number, number, number];
}

/**
 * Identifies a specific point within a polyline annotation.
 * Used to track which point in which segment of which label is currently selected.
 */
export interface SelectedPoint {
  labelId: string;
  segmentIndex: number;
  pointIndex: number;
}

/**
 * Stores the transformed vertices for a single polyline segment.
 * Polyline segments are lists of connected vertices. Segments are stored
 * in an array where the array index corresponds to the segmentIndex.
 */
export interface PolylineSegmentTransform {
  /** All vertices in this segment (connected) */
  points: [number, number, number][];
}

/**
 * Complete transformation data for polyline point annotations.
 * Stores all segments of a polyline along with metadata such as
 * the file path, sample ID, label name, and additional custom properties.
 */
export interface PolylinePointTransformData {
  segments: PolylineSegmentTransform[];
  path?: string;
  sampleId?: string;
  label?: string;
  misc?: Record<string, unknown>;
}

/**
 * State information for an active polyline segment being edited.
 * Tracks whether the segment is currently active, if it's closed,
 * the current mouse position in 3D space, and all vertices in the segment.
 */
export interface SegmentState {
  isActive: boolean;
  isClosed: boolean;
  currentMousePosition: [number, number, number] | null;
  vertices: [number, number, number][];
}

/**
 * State for annotation plane visualization and interaction.
 * Controls the visibility and orientation of annotation planes in the 3D viewer,
 * including which axes (X, Y, Z) are displayed.
 */
export interface AnnotationPlaneState {
  enabled: boolean;
  position: [number, number, number];
  quaternion: [number, number, number, number];
  showX: boolean;
  showY: boolean;
  showZ: boolean;
}

/**
 * Subscription payload for canvas interaction callbacks.
 * Each subscription defines a plane and callbacks for pointer events on that plane.
 */
export type CanvasInteractionSubscriptionPayload = {
  /** Unique identifier for this subscription */
  id: string;
  /** Normal vector of the plane in 3D space (defines the plane's orientation) */
  planeNormal: THREE.Vector3;
  /** Constant term in the plane equation (defines the plane's position) */
  planeConstant: number;
  /** Mouse button number to listen for (0=left, 1=middle, 2=right). If undefined, listens to all buttons */
  button?: number;
  /** Callback invoked when pointer is released on the plane. Receives the 3D intersection point and the pointer event */
  onPointerUp?: (pt: THREE.Vector3, ev: PointerEvent) => void;
  /** Callback invoked when pointer is pressed down on the plane */
  onPointerDown?: () => void;
  /** Callback invoked when pointer moves while over the plane. Receives the 3D intersection point and the pointer event */
  onPointerMove?: (pt: THREE.Vector3, ev: PointerEvent) => void;
};

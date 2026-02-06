import { DETECTION, POLYLINE } from "@fiftyone/utilities";
import { TransformControlsProps } from "@react-three/drei";
import type { RefObject } from "react";
import * as THREE from "three";
import type {
  ReconciledDetection3D,
  ReconciledPolyline3D,
} from "./annotation/types";
import type {
  ACTION_SET_PCDS,
  ACTION_SET_POINT_SIZE,
  ACTION_SHADE_BY,
  ACTION_VIEW_HELP,
  ACTION_VIEW_JSON,
  SHADE_BY_CUSTOM,
  SHADE_BY_HEIGHT,
  SHADE_BY_INTENSITY,
  SHADE_BY_NONE,
  SHADE_BY_RGB,
} from "./constants";
import { OverlayLabel } from "./labels/loader";

export type Actions =
  | typeof ACTION_SHADE_BY
  | typeof ACTION_SET_POINT_SIZE
  | typeof ACTION_SET_PCDS
  | typeof ACTION_VIEW_JSON
  | typeof ACTION_VIEW_HELP;

export type ShadeBy =
  | typeof SHADE_BY_INTENSITY
  | typeof SHADE_BY_HEIGHT
  | typeof SHADE_BY_RGB
  | typeof SHADE_BY_CUSTOM
  | typeof SHADE_BY_NONE
  | string;

export type HoverMetadata = {
  assetName: string;
  attributes?: Record<string, string | number | boolean>;
  renderModeDescriptor?: string;
};

export type NodeName = string;

export type VisibilityMap = Record<NodeName, boolean>;

export type NodeUuid = string;

export type AssetLoadingLog = {
  message: string;
  status: "info" | "success" | "error";
};

/**
 * Comprehensive loading status enum based on Three.js LoadingManager events
 * Covers all possible states during asset loading lifecycle
 */
export enum LoadingStatus {
  /** Initial state - no loading has started */
  IDLE = "idle",
  /** Loading has been initiated (onStart event) */
  STARTED = "started",
  /** Currently loading assets (onProgress event) */
  LOADING = "loading",
  /** All loading completed successfully (onLoad event) */
  SUCCESS = "success",
  /** Loading failed with error (onError event) */
  FAILED = "failed",
  /** Loading was aborted/cancelled */
  ABORTED = "aborted",
}

/**
 * Extended loading status with additional context information
 * Provides more detailed state for UI components
 */
export type LoadingStatusWithContext = {
  status: LoadingStatus;
  /** Current progress percentage (0-100) */
  progress?: number;
  /** Number of items loaded */
  itemsLoaded?: number;
  /** Total number of items to load */
  itemsTotal?: number;
  /** Current URL being loaded */
  currentUrl?: string;
  /** Error message if status is FAILED */
  errorMessage?: string;
  /** Timestamp when status was last updated */
  timestamp?: number;
};

export interface BaseOverlayProps {
  opacity: number;
  rotation: THREE.Vector3Tuple;
  selected: boolean;
  onClick: (e: any) => void;
  tooltip: any;
  label: OverlayLabel;
  color: string;
}

export interface TransformProps extends TransformControlsProps {
  isSelectedForTransform?: boolean;
  onTransformStart?: () => void;
  onTransformEnd?: () => void;
  onTransformChange?: () => void;
  transformControlsRef?: RefObject<any>;
}

export interface HoverState {
  isHovered: boolean;
  setIsHovered: (hovered: boolean) => void;
}

export interface EventHandlers {
  onPointerOver: () => void;
  onPointerOut: () => void;
  restEventHandlers: Record<string, any>;
}

export type Archetype3d = "point" | "cuboid" | "polyline" | "annotation-plane";

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Type guard to check if an overlay is a Detection overlay (3D).
 */
export function isDetection3dOverlay(
  overlay: unknown
): overlay is OverlayLabel & {
  _cls: "Detection";
  dimensions: THREE.Vector3Tuple;
  location: THREE.Vector3Tuple;
  rotation?: THREE.Vector3Tuple;
  quaternion?: THREE.Vector4Tuple;
} & Record<string, unknown> {
  return (
    overlay &&
    typeof overlay === "object" &&
    "_cls" in overlay &&
    overlay._cls === DETECTION &&
    "dimensions" in overlay &&
    "location" in overlay &&
    overlay.dimensions != null &&
    overlay.location != null
  );
}

/**
 * Type guard to check if an overlay is a Polyline overlay (3D).
 */
export function isPolyline3dOverlay(
  overlay: unknown
): overlay is OverlayLabel & {
  _cls: "Polyline";
  points3d: THREE.Vector3Tuple[][];
} & Record<string, unknown> {
  return (
    overlay &&
    typeof overlay === "object" &&
    "_cls" in overlay &&
    overlay._cls === POLYLINE &&
    "points3d" in overlay &&
    overlay.points3d != null
  );
}

/**
 * Type guard to check if a reconciled label is a Detection.
 */
export function isDetection(
  label: ReconciledDetection3D | ReconciledPolyline3D
): label is ReconciledDetection3D {
  return label._cls === "Detection";
}

/**
 * Type guard to check if a reconciled label is a Polyline.
 */
export function isPolyline(
  label: ReconciledDetection3D | ReconciledPolyline3D
): label is ReconciledPolyline3D {
  return label._cls === "Polyline";
}

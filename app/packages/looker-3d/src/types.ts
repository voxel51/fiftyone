import { TransformControlsProps } from "@react-three/drei";
import * as THREE from "three";
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
  transformControlsRef?: React.RefObject<any>;
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

export type TransformArchetype =
  | "point"
  | "cuboid"
  | "polyline"
  | "annotation-plane";

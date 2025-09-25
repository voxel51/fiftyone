import * as THREE from "three";
import { TransformMode, TransformSpace } from "../../state";

export interface BaseOverlayProps {
  opacity: number;
  rotation: THREE.Vector3Tuple;
  selected: boolean;
  onClick: (e: any) => void;
  tooltip: any;
  label: any;
  color: string;
}

export interface TransformProps {
  isSelectedForTransform?: boolean;
  isAnnotateMode?: boolean;
  transformMode?: TransformMode;
  transformSpace?: TransformSpace;
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

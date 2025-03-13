import type { useTooltip } from "@fiftyone/state";
import { ThreeEvent } from "@react-three/fiber";
import type { Vector3Tuple } from "three";
import type { OverlayLabel } from "./loader";

export interface OverlayProps {
  rotation: Vector3Tuple;
  opacity: number;
  tooltip: ReturnType<typeof useTooltip>;
  label: OverlayLabel;
  color: string;
  onClick: (e: ThreeEvent<MouseEvent>) => void;

  useLegacyCoordinates?: boolean;
  selected?: boolean;
}

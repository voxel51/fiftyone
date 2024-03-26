import { useTooltip } from "@fiftyone/state";
import { Vector3Tuple } from "three";
import { OverlayLabel } from "./loader";

export interface OverlayProps {
  rotation: Vector3Tuple;
  opacity: number;
  tooltip: ReturnType<typeof useTooltip>;
  label: OverlayLabel;
  color: string;
  onClick: () => void;

  useLegacyCoordinates?: boolean;
  selected?: boolean;
}

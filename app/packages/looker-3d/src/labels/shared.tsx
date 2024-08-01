import type { useTooltip } from "@fiftyone/state";
import type { Vector3Tuple } from "three";
import type { OverlayLabel } from "./loader";

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

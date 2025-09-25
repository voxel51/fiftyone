import type { useTooltip } from "@fiftyone/state";
import { ThreeEvent } from "@react-three/fiber";
import type { Vector3Tuple } from "three";
import type { OverlayLabel } from "./loader";
import type { BaseOverlayProps, TransformProps } from "./shared/types";

export interface OverlayProps extends BaseOverlayProps, TransformProps {
  useLegacyCoordinates?: boolean;
}

import type { Vector3 } from "three";
import type { FrustumData } from "../../frustum/types";
import { getComplementaryColor } from "../../utils";
import type { ReconciledDetection3D } from "../types";
import { resolveVisualProps } from "./shared";
import { SvgCuboidProjection } from "./SvgCuboidProjection";
import { useProjectedCuboid } from "./useProjectedCuboid";

interface ProjectedCuboidItemProps {
  detection: ReconciledDetection3D & { color?: string };
  frustumData: FrustumData;
  isSelected: boolean;
  isHovered: boolean;
  isAnyLabelSelected: boolean;
  showOrientation: boolean;
  upVector?: Vector3 | null;
}

/**
 * Individual cuboid projection item
 */
export function ProjectedCuboidItem({
  detection,
  frustumData,
  isSelected,
  isHovered,
  isAnyLabelSelected,
  showOrientation,
  upVector,
}: ProjectedCuboidItemProps) {
  const projection = useProjectedCuboid(detection, frustumData, upVector);

  if (!projection) return null;

  const { color, opacity, strokeDasharray } = resolveVisualProps(
    detection.color,
    isSelected,
    isHovered,
    isAnyLabelSelected,
  );
  const orientationColor = showOrientation
    ? getComplementaryColor(color)
    : color;

  return (
    <SvgCuboidProjection
      data={projection}
      color={color}
      orientationColor={orientationColor}
      opacity={opacity}
      showOrientation={showOrientation}
      strokeDasharray={strokeDasharray}
    />
  );
}

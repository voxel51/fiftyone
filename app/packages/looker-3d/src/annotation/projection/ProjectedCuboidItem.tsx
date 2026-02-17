import type { FrustumData } from "../../frustum/types";
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
}: ProjectedCuboidItemProps) {
  const projection = useProjectedCuboid(detection, frustumData);

  if (!projection) return null;

  const { color, opacity, strokeDasharray } = resolveVisualProps(
    detection.color,
    isSelected,
    isHovered,
    isAnyLabelSelected
  );

  return (
    <SvgCuboidProjection
      data={projection}
      color={color}
      opacity={opacity}
      strokeDasharray={strokeDasharray}
    />
  );
}

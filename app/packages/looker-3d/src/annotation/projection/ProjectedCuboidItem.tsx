import type { FrustumData } from "../../frustum/types";
import type { ReconciledDetection3D } from "../types";
import {
  DEFAULT_OPACITY,
  DESELECTED_OPACITY,
  FALLBACK_COLOR,
  HOVERED_COLOR,
  SELECTED_DASH_ARRAY,
} from "./constants";
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

  if (isSelected) {
    return (
      <SvgCuboidProjection
        data={projection}
        color={detection.color ?? FALLBACK_COLOR}
        opacity={1}
        strokeDasharray={SELECTED_DASH_ARRAY}
      />
    );
  }

  if (isAnyLabelSelected) {
    return (
      <SvgCuboidProjection
        data={projection}
        color={detection.color ?? FALLBACK_COLOR}
        opacity={DESELECTED_OPACITY}
      />
    );
  }

  if (isHovered) {
    return (
      <SvgCuboidProjection
        data={projection}
        color={HOVERED_COLOR}
        opacity={1}
      />
    );
  }

  return (
    <SvgCuboidProjection
      data={projection}
      color={detection.color ?? FALLBACK_COLOR}
      opacity={DEFAULT_OPACITY}
    />
  );
}

import type { FrustumData } from "../../frustum/types";
import type { ReconciledPolyline3D } from "../types";
import { resolveVisualProps } from "./shared";
import { SvgPolylineProjection } from "./SvgPolylineProjection";
import { useProjectedPolyline } from "./useProjectedPolyline";

interface ProjectedPolylineItemProps {
  polyline: ReconciledPolyline3D & { color?: string };
  frustumData: FrustumData;
  isSelected: boolean;
  isHovered: boolean;
  isAnyLabelSelected: boolean;
}

/**
 * Individual polyline projection item
 */
export function ProjectedPolylineItem({
  polyline,
  frustumData,
  isSelected,
  isHovered,
  isAnyLabelSelected,
}: ProjectedPolylineItemProps) {
  const projection = useProjectedPolyline(polyline, frustumData);

  if (!projection) return null;

  const { color, opacity, strokeDasharray } = resolveVisualProps(
    polyline.color,
    isSelected,
    isHovered,
    isAnyLabelSelected
  );

  return (
    <SvgPolylineProjection
      data={projection}
      color={color}
      opacity={opacity}
      strokeDasharray={strokeDasharray}
    />
  );
}

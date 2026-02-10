import type { FrustumData } from "../../frustum/types";
import type { ReconciledPolyline3D } from "../types";
import {
  DEFAULT_OPACITY,
  DESELECTED_OPACITY,
  FALLBACK_COLOR,
  SELECTED_DASH_ARRAY,
} from "./constants";
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

  if (isSelected) {
    return (
      <SvgPolylineProjection
        data={projection}
        color={polyline.color ?? FALLBACK_COLOR}
        opacity={1}
        strokeDasharray={SELECTED_DASH_ARRAY}
      />
    );
  }

  if (isAnyLabelSelected) {
    return (
      <SvgPolylineProjection
        data={projection}
        color={polyline.color ?? FALLBACK_COLOR}
        opacity={DESELECTED_OPACITY}
      />
    );
  }

  if (isHovered) {
    return (
      <SvgPolylineProjection
        data={projection}
        color={polyline.color ?? FALLBACK_COLOR}
        opacity={1}
      />
    );
  }

  return (
    <SvgPolylineProjection
      data={projection}
      color={polyline.color ?? FALLBACK_COLOR}
      opacity={DEFAULT_OPACITY}
    />
  );
}

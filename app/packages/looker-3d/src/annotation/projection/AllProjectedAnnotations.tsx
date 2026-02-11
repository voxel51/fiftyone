import type { FrustumData } from "../../frustum/types";
import {
  useCurrentSelected3dAnnotationLabel,
  useHoveredLabel3d,
} from "../../state";
import { useRenderModel } from "../store/renderModel";
import { ProjectedCuboidItem } from "./ProjectedCuboidItem";
import { ProjectedPolylineItem } from "./ProjectedPolylineItem";
import { OverlaySvg } from "./shared";

interface AllProjectedAnnotationsProps {
  frustumData: FrustumData;
}

/**
 * Renders all cuboids and polylines
 */
export function AllProjectedAnnotations({
  frustumData,
}: AllProjectedAnnotationsProps) {
  const renderModel = useRenderModel();
  const selectedLabel = useCurrentSelected3dAnnotationLabel();
  const hoveredLabel = useHoveredLabel3d();

  const { intrinsics } = frustumData;

  if (!intrinsics) return null;

  const hasSize =
    (intrinsics.width != null && intrinsics.height != null) ||
    (intrinsics.cx != null && intrinsics.cy != null);

  if (!hasSize) return null;

  const imgW = intrinsics.width ?? Math.round(intrinsics.cx * 2);
  const imgH = intrinsics.height ?? Math.round(intrinsics.cy * 2);

  const selectedId = selectedLabel?._id ?? null;
  const hoveredId = hoveredLabel?.id ?? null;
  const isSameAsSelected = hoveredId != null && hoveredId === selectedId;
  const isAnyLabelSelected = selectedId != null;

  return (
    <OverlaySvg
      viewBox={`0 0 ${imgW} ${imgH}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {renderModel.detections.map((detection) => (
        <ProjectedCuboidItem
          key={`cuboid-${detection._id}`}
          detection={detection}
          frustumData={frustumData}
          isSelected={detection._id === selectedId}
          isHovered={detection._id === hoveredId && !isSameAsSelected}
          isAnyLabelSelected={isAnyLabelSelected}
        />
      ))}

      {renderModel.polylines.map((polyline) => (
        <ProjectedPolylineItem
          key={`polyline-${polyline._id}`}
          polyline={polyline}
          frustumData={frustumData}
          isSelected={polyline._id === selectedId}
          isHovered={polyline._id === hoveredId && !isSameAsSelected}
          isAnyLabelSelected={isAnyLabelSelected}
        />
      ))}
    </OverlaySvg>
  );
}

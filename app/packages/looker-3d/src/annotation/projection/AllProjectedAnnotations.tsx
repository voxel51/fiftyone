import type { Vector3 } from "three";
import type { FrustumData } from "../../frustum/types";
import {
  useCuboidOrientation,
  useCurrentSelected3dAnnotationLabel,
  useHoveredLabel3d,
} from "../../state";
import { useRenderModel } from "../store/renderModel";
import { ProjectedCuboidItem } from "./ProjectedCuboidItem";
import { ProjectedPolylineItem } from "./ProjectedPolylineItem";
import { OverlaySvg } from "./shared";

interface AllProjectedAnnotationsProps {
  frustumData: FrustumData;
  upVector?: Vector3 | null;
}

/**
 * Renders all cuboids and polylines
 */
export function AllProjectedAnnotations({
  frustumData,
  upVector,
}: AllProjectedAnnotationsProps) {
  const renderModel = useRenderModel();
  const selectedLabel = useCurrentSelected3dAnnotationLabel();
  const hoveredLabel = useHoveredLabel3d();
  const showCuboidOrientation = useCuboidOrientation();

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
          key={`cuboid-${detection.label._id}`}
          detection={detection}
          frustumData={frustumData}
          isSelected={detection.label._id === selectedId}
          isHovered={detection.label._id === hoveredId && !isSameAsSelected}
          isAnyLabelSelected={isAnyLabelSelected}
          showOrientation={showCuboidOrientation}
          upVector={upVector}
        />
      ))}

      {renderModel.polylines.map((polyline) => (
        <ProjectedPolylineItem
          key={`polyline-${polyline.label._id}`}
          polyline={polyline}
          frustumData={frustumData}
          isSelected={polyline.label._id === selectedId}
          isHovered={polyline.label._id === hoveredId && !isSameAsSelected}
          isAnyLabelSelected={isAnyLabelSelected}
        />
      ))}
    </OverlaySvg>
  );
}

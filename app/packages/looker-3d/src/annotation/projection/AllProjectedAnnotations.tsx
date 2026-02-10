import styled from "styled-components";
import type { FrustumData } from "../../frustum/types";
import {
  useCurrentSelected3dAnnotationLabel,
  useHoveredLabel3d,
} from "../../state";
import { useRenderModel } from "../store/renderModel";
import type { ReconciledDetection3D, ReconciledPolyline3D } from "../types";
import { SvgCuboidProjection } from "./SvgCuboidProjection";
import { SvgPolylineProjection } from "./SvgPolylineProjection";
import { useProjectedCuboid } from "./useProjectedCuboid";
import { useProjectedPolyline } from "./useProjectedPolyline";

const DEFAULT_OPACITY = 0.7;
const DESELECTED_OPACITY = 0.3;
const FALLBACK_COLOR = "#00ff00";
const SELECTED_DASH_ARRAY = "5,5";

const OverlaySvg = styled.svg`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
`;

interface AllProjectedAnnotationsProps {
  frustumData: FrustumData;
}

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
function ProjectedCuboidItem({
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
        color={detection.color ?? FALLBACK_COLOR}
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
function ProjectedPolylineItem({
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

  const imgW = intrinsics?.width ?? Math.round((intrinsics?.cx ?? 0) * 2);
  const imgH = intrinsics?.height ?? Math.round((intrinsics?.cy ?? 0) * 2);

  const selectedId = selectedLabel?._id ?? null;
  const hoveredId = hoveredLabel?.id ?? null;
  const isSameAsSelected = hoveredId != null && hoveredId === selectedId;
  const isAnyLabelSelected = selectedId != null;

  if (!imgW || !imgH) return null;

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

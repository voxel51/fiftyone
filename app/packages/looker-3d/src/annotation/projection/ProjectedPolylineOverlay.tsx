import styled from "styled-components";
import type { FrustumData } from "../../frustum/types";
import {
  useCurrentSelected3dAnnotationLabel,
  useHoveredLabel3d,
} from "../../state";
import { useRenderPolyline } from "../store/renderModel";
import type { PolylineTransformData } from "../types";
import { SvgPolylineProjection } from "./SvgPolylineProjection";
import { useProjectedPolyline } from "./useProjectedPolyline";

const HOVERED_POLYLINE_COLOR = "#ffffff";

const OverlaySvg = styled.svg`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
`;

interface ProjectedPolylineOverlayProps {
  frustumData: FrustumData;
}

/**
 * Overlay that projects 3D polylines onto a 2D image slice.
 */
export function ProjectedPolylineOverlay({
  frustumData,
}: ProjectedPolylineOverlayProps) {
  const selectedLabel = useCurrentSelected3dAnnotationLabel();
  const hoveredLabel = useHoveredLabel3d();

  const selectedPolyline = useRenderPolyline(selectedLabel?._id ?? "");
  const hoveredPolyline = useRenderPolyline(hoveredLabel?.id ?? "");

  const selectedData =
    selectedPolyline ?? (selectedLabel as PolylineTransformData);

  const selectedProjection = useProjectedPolyline(selectedData, frustumData);
  const hoveredProjection = useProjectedPolyline(hoveredPolyline, frustumData);

  const isHoveredSameAsSelected =
    hoveredLabel?.id != null && hoveredLabel.id === selectedLabel?._id;
  const showHovered = hoveredProjection && !isHoveredSameAsSelected;

  if (!selectedProjection && !showHovered) return null;

  const { intrinsics } = frustumData;
  if (!intrinsics) return null;

  const imgW = intrinsics.width ?? Math.round(intrinsics.cx * 2);
  const imgH = intrinsics.height ?? Math.round(intrinsics.cy * 2);
  if (!imgW || !imgH) return null;

  const selectedColor = selectedLabel?.["color"] ?? "#00ff00";

  return (
    <OverlaySvg
      viewBox={`0 0 ${imgW} ${imgH}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {showHovered && (
        <SvgPolylineProjection
          data={hoveredProjection}
          color={HOVERED_POLYLINE_COLOR}
        />
      )}
      {selectedProjection && (
        <SvgPolylineProjection
          data={selectedProjection}
          color={selectedColor}
        />
      )}
    </OverlaySvg>
  );
}

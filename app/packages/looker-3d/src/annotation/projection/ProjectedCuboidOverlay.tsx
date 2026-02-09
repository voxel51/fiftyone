import styled from "styled-components";
import type { FrustumData } from "../../frustum/types";
import {
  useCurrentSelected3dAnnotationLabel,
  useHoveredLabel3d,
} from "../../state";
import { useRenderDetection } from "../store/renderModel";
import type { CuboidTransformData } from "../types";
import { SvgCuboidProjection } from "./SvgCuboidProjection";
import { useProjectedCuboid } from "./useProjectedCuboid";

const HOVERED_CUBOID_COLOR = "#ffffff";

const OverlaySvg = styled.svg`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
`;

interface ProjectedCuboidOverlayProps {
  frustumData: FrustumData;
}

/**
 * Overlay that projects 3D cuboids onto a 2D image slice.
 */
export function ProjectedCuboidOverlay({
  frustumData,
}: ProjectedCuboidOverlayProps) {
  const selectedLabel = useCurrentSelected3dAnnotationLabel();
  const hoveredLabel = useHoveredLabel3d();

  // Resolve cuboid data from the render model (reflects live edits),
  // falling back to the raw atom value for the selected label.
  const selectedDetection = useRenderDetection(selectedLabel?._id ?? "");
  const hoveredDetection = useRenderDetection(hoveredLabel?.id ?? "");

  const selectedCuboid =
    selectedDetection ?? (selectedLabel as CuboidTransformData);

  const selectedProjection = useProjectedCuboid(selectedCuboid, frustumData);
  const hoveredProjection = useProjectedCuboid(hoveredDetection, frustumData);

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
      // Scale SVG uniformly to fit the container, centering within any leftover space
      preserveAspectRatio="xMidYMid meet"
    >
      {showHovered && (
        <SvgCuboidProjection
          data={hoveredProjection}
          color={HOVERED_CUBOID_COLOR}
        />
      )}
      {selectedProjection && (
        <SvgCuboidProjection data={selectedProjection} color={selectedColor} />
      )}
    </OverlaySvg>
  );
}

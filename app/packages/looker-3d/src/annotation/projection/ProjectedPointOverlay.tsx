import { useTheme } from "@fiftyone/components";
import styled from "styled-components";
import type { FrustumData } from "../../frustum/types";
import { useRaycastResult } from "../../hooks/use-raycast-result";
import type { PanelId } from "../../types";
import { OverlaySvg } from "./shared";
import { useProjected3dPoint } from "./useProjected3dPoint";

/**
 * Positions the tooltip content relative to the crosshair,
 * anchoring it to the top or bottom edge depending on available space.
 */
export const TooltipAnchor = styled.div<{ $alignEnd: boolean }>`
  display: flex;
  align-items: ${({ $alignEnd }) => ($alignEnd ? "flex-end" : "flex-start")};
  justify-content: center;
  height: 100%;
`;

/**
 * The 3D coordinate badge shown near the projected crosshair.
 */
export const CoordLabel = styled.div<{ $fontSize: number }>`
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: ${({ $fontSize }) => $fontSize}px;
  line-height: 1;
  padding: ${({ $fontSize }) => `${$fontSize * 0.25}px ${$fontSize * 0.4}px`};
  border-radius: ${({ $fontSize }) => $fontSize * 0.2}px;
  white-space: nowrap;
  font-family: monospace;
  opacity: 0.85;
`;

function formatCoord(pos: [number, number, number]): string {
  return `(${pos[0].toFixed(1)}, ${pos[1].toFixed(1)}, ${pos[2].toFixed(1)})`;
}

interface ProjectedPointOverlayProps {
  frustumData: FrustumData;
  panelId: PanelId;
}

/**
 * Overlay that projects the raycasted 3D cursor position onto a 2D image slice
 * as a crosshair.
 */
export function ProjectedPointOverlay({
  frustumData,
  panelId,
}: ProjectedPointOverlayProps) {
  const theme = useTheme();
  const raycastResult = useRaycastResult();
  const projectedPoint = useProjected3dPoint(
    raycastResult,
    frustumData,
    panelId
  );

  if (!projectedPoint) return null;

  const { intrinsics } = frustumData;
  if (!intrinsics) return null;

  const imgW = intrinsics.width ?? Math.round(intrinsics.cx * 2);
  const imgH = intrinsics.height ?? Math.round(intrinsics.cy * 2);

  const { u, v } = projectedPoint;
  const crosshairSize = 10;
  const fontSize = Math.max(10, Math.round(Math.min(imgW, imgH) * 0.07));
  const tooltipHeight = fontSize * 2.5;
  const gap = 4;
  const tooltipBelow = v + crosshairSize + gap + tooltipHeight <= imgH;
  const tooltipY = tooltipBelow
    ? v + crosshairSize + gap
    : v - crosshairSize - gap - tooltipHeight;

  return (
    <OverlaySvg
      viewBox={`0 0 ${imgW} ${imgH}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Horizontal line */}
      <line
        x1={u - crosshairSize}
        y1={v}
        x2={u + crosshairSize}
        y2={v}
        stroke={theme.primary.main}
        strokeWidth={2}
        opacity={0.7}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
      />
      {/* Vertical line */}
      <line
        x1={u}
        y1={v - crosshairSize}
        x2={u}
        y2={v + crosshairSize}
        stroke={theme.primary.main}
        strokeWidth={2}
        opacity={0.7}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
      />
      {/* Center dot */}
      <circle
        cx={u}
        cy={v}
        r={2}
        fill={theme.primary.main}
        opacity={0.9}
        vectorEffect="non-scaling-stroke"
      />
      {/* 3D coordinate tooltip */}
      {raycastResult.worldPosition && (
        <foreignObject
          x={u - imgW * 0.25}
          y={tooltipY}
          width={imgW * 0.5}
          height={tooltipHeight}
        >
          <TooltipAnchor $alignEnd={!tooltipBelow}>
            <CoordLabel $fontSize={fontSize}>
              {formatCoord(raycastResult.worldPosition)}
            </CoordLabel>
          </TooltipAnchor>
        </foreignObject>
      )}
    </OverlaySvg>
  );
}

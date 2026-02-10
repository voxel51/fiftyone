import { useTheme } from "@fiftyone/components";
import styled from "styled-components";
import type { FrustumData } from "../../frustum/types";
import { useRaycastResult } from "../../hooks/use-raycast-result";
import type { PanelId } from "../../types";
import { useProjected3dPoint } from "./useProjected3dPoint";

function formatCoord(pos: [number, number, number]): string {
  return `(${pos[0].toFixed(1)}, ${pos[1].toFixed(1)}, ${pos[2].toFixed(1)})`;
}

const OverlaySvg = styled.svg`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
`;

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
          y={v + crosshairSize + 4}
          width={imgW * 0.5}
          height={fontSize * 2.5}
        >
          <div
            style={{
              background: "rgba(0, 0, 0, 0.55)",
              color: "#fff",
              fontSize: `${fontSize}px`,
              lineHeight: 1,
              padding: `${fontSize * 0.25}px ${fontSize * 0.4}px`,
              borderRadius: `${fontSize * 0.2}px`,
              whiteSpace: "nowrap",
              fontFamily: "monospace",
              opacity: 0.85,
              textAlign: "center",
              margin: "0 auto",
              width: "fit-content",
            }}
          >
            {formatCoord(raycastResult.worldPosition)}
          </div>
        </foreignObject>
      )}
    </OverlaySvg>
  );
}

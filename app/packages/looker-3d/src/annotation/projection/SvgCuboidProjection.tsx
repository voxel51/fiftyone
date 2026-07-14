import type { CuboidProjectionData, ProjectedEdge } from "./types";

const ORIENTATION_ARROW_HEAD_LENGTH = 12;
const ORIENTATION_ARROW_HEAD_WIDTH = 7;
const MIN_ORIENTATION_ARROW_LENGTH = 1;

interface SvgCuboidProjectionProps {
  data: CuboidProjectionData;
  color: string;
  opacity?: number;
  orientationColor?: string;
  showOrientation?: boolean;
  strokeDasharray?: string;
}

const getOrientationArrowHeadPoints = (edge: ProjectedEdge) => {
  const dx = edge.x2 - edge.x1;
  const dy = edge.y2 - edge.y1;
  const length = Math.hypot(dx, dy);

  if (length <= MIN_ORIENTATION_ARROW_LENGTH) {
    return null;
  }

  const headLength = Math.min(
    ORIENTATION_ARROW_HEAD_LENGTH,
    Math.max(length - MIN_ORIENTATION_ARROW_LENGTH, 0),
  );

  if (headLength <= 0) {
    return null;
  }

  const ux = dx / length;
  const uy = dy / length;
  const baseX = edge.x2 - ux * headLength;
  const baseY = edge.y2 - uy * headLength;
  const halfWidth =
    (ORIENTATION_ARROW_HEAD_WIDTH * headLength) /
    ORIENTATION_ARROW_HEAD_LENGTH /
    2;
  const leftX = baseX - uy * halfWidth;
  const leftY = baseY + ux * halfWidth;
  const rightX = baseX + uy * halfWidth;
  const rightY = baseY - ux * halfWidth;

  return `${edge.x2},${edge.y2} ${leftX},${leftY} ${rightX},${rightY}`;
};

/**
 * Renders a 3D cuboid projected onto 2D as an SVG group of edges and corner vertices.
 */
export function SvgCuboidProjection({
  data,
  color,
  opacity = 1,
  orientationColor = color,
  showOrientation = false,
  strokeDasharray,
}: SvgCuboidProjectionProps) {
  const orientationArrowHead = showOrientation
    ? data.orientation && getOrientationArrowHeadPoints(data.orientation)
    : null;

  return (
    <g opacity={opacity}>
      {data.edges.map((e, i) => (
        <line
          key={i}
          x1={e.x1}
          y1={e.y1}
          x2={e.x2}
          y2={e.y2}
          stroke={color}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeDasharray={strokeDasharray}
        />
      ))}
      {data.corners.map((p, i) =>
        p ? (
          <circle
            key={`v-${i}`}
            cx={p.u}
            cy={p.v}
            r={3}
            fill={color}
            vectorEffect="non-scaling-stroke"
          />
        ) : null,
      )}
      {showOrientation && data.orientation && (
        <line
          x1={data.orientation.x1}
          y1={data.orientation.y1}
          x2={data.orientation.x2}
          y2={data.orientation.y2}
          stroke={orientationColor}
          strokeWidth={3}
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
        />
      )}
      {orientationArrowHead && (
        <polygon points={orientationArrowHead} fill={orientationColor} />
      )}
    </g>
  );
}

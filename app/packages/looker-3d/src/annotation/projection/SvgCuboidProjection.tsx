import type { CuboidProjectionData } from "./types";

/**
 * Renders a 3D cuboid projected onto 2D as an SVG group of edges and corner vertices.
 */
export function SvgCuboidProjection({
  data,
  color,
}: {
  data: CuboidProjectionData;
  color: string;
}) {
  return (
    <g>
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
        ) : null
      )}
    </g>
  );
}

import { OverlaySvg, resolveVisualProps } from "../projection/shared";
import { SvgPolylineProjection } from "../projection/SvgPolylineProjection";
import { buildPolylinePixelData } from "./geometry";
import type { Native2dLabel } from "./types";
import { useImageNaturalSize } from "./useImageNaturalSize";
import { useNative2dLabelColor } from "./useNative2dLabelColor";

const LABEL_FONT_SIZE = 14;
const LABEL_TEXT_OFFSET = 6;
// Filled polylines wash out the image at full strength.
const FILL_OPACITY = 0.3;

interface Native2dAnnotationsProps {
  labels: Native2dLabel[];
  imageUrl: string | null;
}

/**
 * Renders a camera slice's stored 2D `Detection`/`Polyline` labels as an SVG
 * overlay, reusing the same overlay layer/primitives as the projected-3D
 * annotations. Unlike the 3D projection, these labels are already in normalized
 * image space, so we scale by the image's natural dimensions rather than
 * projecting through the camera frustum.
 */
export function Native2dAnnotations({
  labels,
  imageUrl,
}: Native2dAnnotationsProps) {
  const size = useImageNaturalSize(imageUrl);
  const colorOf = useNative2dLabelColor();

  if (!size || labels.length === 0) return null;

  const { w, h } = size;

  return (
    <OverlaySvg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
      {labels.map((label) => {
        const { color, opacity } = resolveVisualProps(
          colorOf(label),
          false,
          false,
          false,
        );

        if (label._cls === "Detection") {
          const [x, y, bw, bh] = label.boundingBox;
          return (
            <g key={`native-det-${label._id}`} opacity={opacity}>
              <rect
                x={x * w}
                y={y * h}
                width={bw * w}
                height={bh * h}
                fill="none"
                stroke={color}
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
              {label.label && (
                <text
                  x={x * w}
                  // Sits just above the box, dropping inside it near the top
                  // edge so it can't be clipped off the image.
                  y={Math.max(y * h - LABEL_TEXT_OFFSET, LABEL_FONT_SIZE)}
                  fill={color}
                  fontSize={LABEL_FONT_SIZE}
                  // Keeps the caption readable regardless of the viewBox scale.
                  style={{ paintOrder: "stroke" }}
                  stroke="rgba(0, 0, 0, 0.65)"
                  strokeWidth={3}
                  strokeLinejoin="round"
                >
                  {label.label}
                </text>
              )}
            </g>
          );
        }

        const polylineData = buildPolylinePixelData(label, w, h);

        return (
          <g key={`native-poly-${label._id}`}>
            {label.filled &&
              polylineData.segments.map((segment, i) =>
                segment.length > 2 ? (
                  <polygon
                    key={`fill-${i}`}
                    points={segment.map((p) => `${p.u},${p.v}`).join(" ")}
                    fill={color}
                    opacity={opacity * FILL_OPACITY}
                    stroke="none"
                  />
                ) : null,
              )}
            <SvgPolylineProjection
              data={polylineData}
              color={color}
              opacity={opacity}
            />
          </g>
        );
      })}
    </OverlaySvg>
  );
}

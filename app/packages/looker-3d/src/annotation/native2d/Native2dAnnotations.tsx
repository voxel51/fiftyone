import { OverlaySvg, resolveVisualProps } from "../projection/shared";
import { SvgPolylineProjection } from "../projection/SvgPolylineProjection";
import { buildPolylinePixelData } from "./geometry";
import type { Native2dLabel } from "./types";
import { useImageNaturalSize } from "./useImageNaturalSize";
import { useNative2dLabelColor } from "./useNative2dLabelColor";

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
            <rect
              key={`native-det-${label._id}`}
              x={x * w}
              y={y * h}
              width={bw * w}
              height={bh * h}
              fill="none"
              stroke={color}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
              opacity={opacity}
            />
          );
        }

        return (
          <SvgPolylineProjection
            key={`native-poly-${label._id}`}
            data={buildPolylinePixelData(label, w, h)}
            color={color}
            opacity={opacity}
          />
        );
      })}
    </OverlaySvg>
  );
}

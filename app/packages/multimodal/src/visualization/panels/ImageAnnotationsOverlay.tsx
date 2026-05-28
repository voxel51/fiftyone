import type { CSSProperties } from "react";
import { Fragment, useEffect, useRef, useState } from "react";

import type {
  ImageAnnotationCircle,
  ImageAnnotationPoints,
  ImageAnnotationText,
  ImageAnnotationsVisualization,
  RgbaColor,
} from "../../decoders";

export interface ImageAnnotationsOverlayProps {
  readonly annotations: readonly ImageAnnotationsVisualization[];
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly fit: "contain" | "cover";
}

/**
 * SVG overlay that renders decoded Foxglove image-annotation primitives over
 * the image panel. Coordinates are image pixels; the SVG `viewBox` matches
 * the natural image dimensions so the same fit strategy used by the panel
 * applies to the overlay.
 */
export function ImageAnnotationsOverlay({
  annotations,
  imageWidth,
  imageHeight,
  fit,
}: ImageAnnotationsOverlayProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setContainerSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (annotations.length === 0 || imageWidth <= 0 || imageHeight <= 0) {
    return <div ref={containerRef} style={containerStyle} aria-hidden />;
  }

  const rect = containerSize
    ? displayRect(containerSize, imageWidth, imageHeight, fit)
    : null;

  return (
    <div ref={containerRef} style={containerStyle} aria-hidden>
      {rect ? (
        <svg
          viewBox={`0 0 ${imageWidth} ${imageHeight}`}
          preserveAspectRatio="none"
          style={{
            position: "absolute",
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height,
            pointerEvents: "none",
          }}
        >
          {annotations.map((set, i) => (
            <Fragment key={i}>
              {set.points.map((p, j) => (
                <PointsPrimitive key={`p-${i}-${j}`} primitive={p} />
              ))}
              {set.circles.map((c, j) => (
                <CirclePrimitive key={`c-${i}-${j}`} primitive={c} />
              ))}
              {set.texts.map((t, j) => (
                <TextPrimitive key={`t-${i}-${j}`} primitive={t} />
              ))}
            </Fragment>
          ))}
        </svg>
      ) : null}
    </div>
  );
}

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Letterbox/pillarbox the image's natural dimensions into the container,
 * matching the `ImageTexturePlane` scale strategy so the SVG overlay
 * sits exactly over the rendered image rather than the container box.
 */
function displayRect(
  container: { width: number; height: number },
  imageWidth: number,
  imageHeight: number,
  fit: "contain" | "cover"
): Rect {
  const containerAspect = container.width / Math.max(1, container.height);
  const imageAspect = imageWidth / Math.max(1, imageHeight);
  const imageIsWider = imageAspect > containerAspect;
  const constrainByWidth = fit === "contain" ? imageIsWider : !imageIsWider;
  const width = constrainByWidth
    ? container.width
    : container.height * imageAspect;
  const height = constrainByWidth
    ? container.width / imageAspect
    : container.height;
  return {
    x: (container.width - width) / 2,
    y: (container.height - height) / 2,
    width,
    height,
  };
}

function CirclePrimitive({ primitive }: { primitive: ImageAnnotationCircle }) {
  const [x, y] = primitive.position;
  const radius = Math.max(0, primitive.diameter / 2);
  return (
    <circle
      cx={x}
      cy={y}
      r={radius}
      fill={rgbaToCss(primitive.fillColor) ?? "none"}
      stroke={rgbaToCss(primitive.outlineColor) ?? DEFAULT_STROKE}
      strokeWidth={Math.max(1, primitive.thickness)}
      vectorEffect="non-scaling-stroke"
    />
  );
}

function PointsPrimitive({ primitive }: { primitive: ImageAnnotationPoints }) {
  const stroke = rgbaToCss(primitive.outlineColor) ?? DEFAULT_STROKE;
  const fill = rgbaToCss(primitive.fillColor);
  const thickness = Math.max(1, primitive.thickness);

  switch (primitive.type) {
    case "points":
      return (
        <g>
          {primitive.points.map(([x, y], i) => (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={thickness}
              fill={rgbaToCss(primitive.outlineColors[i]) ?? fill ?? stroke}
            />
          ))}
        </g>
      );

    case "line-loop":
    case "line-strip": {
      const pts =
        primitive.type === "line-loop" && primitive.points.length > 1
          ? [...primitive.points, primitive.points[0]]
          : primitive.points;
      return (
        <polyline
          points={pts.map(([x, y]) => `${x},${y}`).join(" ")}
          fill={primitive.type === "line-loop" ? fill ?? "none" : "none"}
          stroke={stroke}
          strokeWidth={thickness}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      );
    }

    case "line-list": {
      const segments = [];
      for (let i = 0; i + 1 < primitive.points.length; i += 2) {
        const [x1, y1] = primitive.points[i];
        const [x2, y2] = primitive.points[i + 1];
        segments.push(
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={stroke}
            strokeWidth={thickness}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        );
      }
      return <g>{segments}</g>;
    }
  }
}

function TextPrimitive({ primitive }: { primitive: ImageAnnotationText }) {
  const [x, y] = primitive.position;
  const fill = rgbaToCss(primitive.textColor) ?? DEFAULT_TEXT_FILL;
  const fontSize = Math.max(1, primitive.fontSize);
  const background = rgbaToCss(primitive.backgroundColor);

  return (
    <g>
      {background ? (
        <rect
          x={x - 2}
          y={y - fontSize}
          width={primitive.text.length * fontSize * 0.6 + 4}
          height={fontSize + 4}
          fill={background}
        />
      ) : null}
      <text
        x={x}
        y={y}
        fill={fill}
        fontSize={fontSize}
        fontFamily="system-ui, sans-serif"
        dominantBaseline="alphabetic"
      >
        {primitive.text}
      </text>
    </g>
  );
}

function rgbaToCss(color: RgbaColor | null | undefined): string | undefined {
  if (!color) return undefined;
  const [r, g, b, a] = color;
  const r255 = clamp01(r) * 255;
  const g255 = clamp01(g) * 255;
  const b255 = clamp01(b) * 255;
  return `rgba(${r255.toFixed(0)}, ${g255.toFixed(0)}, ${b255.toFixed(
    0
  )}, ${clamp01(a).toFixed(3)})`;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v <= 0) return 0;
  if (v >= 1) return 1;
  return v;
}

const DEFAULT_STROKE = "rgba(255, 122, 24, 0.95)";
const DEFAULT_TEXT_FILL = "rgba(255, 255, 255, 0.95)";

const containerStyle: CSSProperties = {
  inset: 0,
  pointerEvents: "none",
  position: "absolute",
};

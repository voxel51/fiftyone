import clsx from "clsx";
import type { CSSProperties } from "react";
import React, {
  Fragment,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  ImageAnnotationCircle,
  ImageAnnotationPoints,
  ImageAnnotationText,
  ImageAnnotationsVisualization,
  RgbaColor,
} from "../../decoders";
import { groupLineSegmentsByLabel } from "../../utils/line-segment-grouping";
import type {
  ImageAnnotationBounds,
  ImageAnnotationLineListGroup,
  ImageAnnotationRenderMetadata,
} from "./image-annotation-render-metadata";
import {
  imageDisplayRect,
  transformedImageDisplayRect,
  type ImageViewTransform,
} from "./base-2d-scene";
import styles from "./image-annotations-overlay.module.css";

export type ImageAnnotationPrimitive =
  | { readonly kind: "circle"; readonly value: ImageAnnotationCircle }
  | { readonly kind: "points"; readonly value: ImageAnnotationPoints }
  | { readonly kind: "text"; readonly value: ImageAnnotationText };

export type ImageAnnotationSelectHandler = (
  picked: ImageAnnotationPickedPrimitive,
  modifiers: { readonly shiftKey: boolean },
) => void;

export type ImagePixelTransform = (
  u: number,
  v: number,
) => readonly [number, number] | null;

const ImagePixelTransformContext = createContext<ImagePixelTransform | null>(
  null,
);

export interface ImageAnnotationPickedPrimitive {
  readonly key: string;
  readonly setIndex: number;
  readonly primitiveIndex: number;
  readonly primitive: ImageAnnotationPrimitive;
  readonly color: string;
  readonly label: string | null;
}

export interface ImageAnnotationsOverlayProps {
  readonly annotations: readonly ImageAnnotationsVisualization[];
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly fit: "contain" | "cover";
  readonly strokeWidth?: number;
  readonly selectedKey?: string | null;
  /**
   * Cross-view echo: shapes whose derived label equals this are drawn in
   * the selected style even when `selectedKey` points elsewhere (or at a
   * 3D object). Best-effort — 2D annotations carry no object ids.
   */
  readonly highlightLabel?: string | null;
  readonly onSelectPrimitive?: ImageAnnotationSelectHandler;
  /** Optional render-ready grouping prepared with interpolated geometry. */
  readonly renderMetadata?: readonly ImageAnnotationRenderMetadata[];
  /** Optional nonlinear source-pixel to displayed-pixel mapping. */
  readonly pixelTransform?: ImagePixelTransform;
  readonly viewTransform?: ImageViewTransform;
}

/**
 * SVG overlay that renders decoded Foxglove image-annotation primitives over
 * the image panel. Coordinates are image pixels; the SVG is positioned over
 * the image's display rect so a `preserveAspectRatio="none"` viewBox maps
 * cleanly.
 *
 * LINE_LIST primitives are split into per-object groups via connected
 * components on shared endpoints so each cuboid gets its own hover scope
 * and interior hit target — Foxglove encodes a whole frame's cuboid edges
 * as one big LINE_LIST.
 */
export function ImageAnnotationsOverlay({
  annotations,
  imageWidth,
  imageHeight,
  fit,
  strokeWidth,
  selectedKey,
  highlightLabel,
  onSelectPrimitive,
  renderMetadata,
  pixelTransform,
  viewTransform,
}: ImageAnnotationsOverlayProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  // This effect tracks the overlay container size for image-space transforms.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
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
    ? transformedImageDisplayRect(
        imageDisplayRect(
          containerSize,
          { height: imageHeight, width: imageWidth },
          fit,
        ),
        viewTransform,
      )
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
          <ImagePixelTransformContext.Provider value={pixelTransform ?? null}>
            {annotations.map((set, i) => (
              <Fragment key={i}>
                <SetPrimitives
                  set={set}
                  setIndex={i}
                  strokeWidth={strokeWidth}
                  selectedKey={selectedKey ?? null}
                  highlightLabel={highlightLabel ?? null}
                  onSelectPrimitive={onSelectPrimitive}
                  renderMetadata={renderMetadata?.[i]}
                />
              </Fragment>
            ))}
          </ImagePixelTransformContext.Provider>
        </svg>
      ) : null}
    </div>
  );
}

interface SetPrimitivesProps {
  readonly set: ImageAnnotationsVisualization;
  readonly setIndex: number;
  readonly strokeWidth?: number;
  readonly selectedKey: string | null;
  readonly highlightLabel: string | null;
  readonly onSelectPrimitive?: ImageAnnotationSelectHandler;
  readonly renderMetadata?: ImageAnnotationRenderMetadata;
}

function SetPrimitives({
  set,
  setIndex,
  strokeWidth,
  selectedKey,
  highlightLabel,
  onSelectPrimitive,
  renderMetadata,
}: SetPrimitivesProps) {
  return (
    <>
      {set.points.map((p, j) =>
        p.type === "line-list" ? (
          <LineListGroups
            key={`p-${setIndex}-${j}`}
            primitive={p}
            primitiveIndex={j}
            setIndex={setIndex}
            texts={set.texts}
            strokeWidth={strokeWidth}
            selectedKey={selectedKey}
            highlightLabel={highlightLabel}
            onSelectPrimitive={onSelectPrimitive}
            preparedGroups={renderMetadata?.lineListGroups[j] ?? undefined}
          />
        ) : (
          <PolylinePrimitive
            key={`p-${setIndex}-${j}`}
            primitive={p}
            primitiveIndex={j}
            setIndex={setIndex}
            texts={set.texts}
            strokeWidth={strokeWidth}
            selectedKey={selectedKey}
            highlightLabel={highlightLabel}
            onSelectPrimitive={onSelectPrimitive}
          />
        ),
      )}
      {set.circles.map((c, j) => (
        <CirclePrimitive
          key={`c-${setIndex}-${j}`}
          primitive={c}
          primitiveIndex={j}
          setIndex={setIndex}
          texts={set.texts}
          strokeWidth={strokeWidth}
          selectedKey={selectedKey}
          highlightLabel={highlightLabel}
          onSelectPrimitive={onSelectPrimitive}
        />
      ))}
      {set.texts.map((t, j) => (
        <TextPrimitive
          key={`t-${setIndex}-${j}`}
          primitive={t}
          primitiveIndex={j}
          setIndex={setIndex}
          selectedKey={selectedKey}
          highlightLabel={highlightLabel}
          onSelectPrimitive={onSelectPrimitive}
        />
      ))}
    </>
  );
}

interface CirclePrimitiveProps {
  readonly primitive: ImageAnnotationCircle;
  readonly primitiveIndex: number;
  readonly setIndex: number;
  readonly texts: readonly ImageAnnotationText[];
  readonly strokeWidth?: number;
  readonly selectedKey: string | null;
  readonly highlightLabel: string | null;
  readonly onSelectPrimitive?: ImageAnnotationSelectHandler;
}

function CirclePrimitive({
  primitive,
  primitiveIndex,
  setIndex,
  texts,
  strokeWidth,
  selectedKey,
  highlightLabel,
  onSelectPrimitive,
}: CirclePrimitiveProps) {
  const pixelTransform = useContext(ImagePixelTransformContext);
  const [x, y] = primitive.position;
  const radius = Math.max(0, primitive.diameter / 2);
  const label = nearestLabel(texts, [x, y]);
  const color = colorForLabel(label);
  const key = `c-${setIndex}-${primitiveIndex}`;
  const onClick = pickHandler(onSelectPrimitive, {
    key,
    setIndex,
    primitiveIndex,
    primitive: { kind: "circle", value: primitive },
    color,
    label,
  });
  const isSelected =
    selectedKey === key ||
    (highlightLabel !== null && label === highlightLabel);
  const transformedCircle = pixelTransform
    ? transformedCirclePoints(primitive, pixelTransform)
    : null;
  return (
    <g
      className={clsx(
        styles.primitive,
        onClick && styles.selectable,
        isSelected && styles.selected,
      )}
      style={primitiveStyle(color)}
      onClick={onClick}
    >
      {transformedCircle ? (
        <>
          <polygon
            points={svgPoints(transformedCircle)}
            className={styles.fillInterior}
          />
          <polygon
            points={svgPoints(transformedCircle)}
            strokeWidth={lineWidth(primitive.thickness, strokeWidth)}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            fill="none"
          />
        </>
      ) : pixelTransform ? null : (
        <>
          <circle cx={x} cy={y} r={radius} className={styles.fillInterior} />
          <circle
            cx={x}
            cy={y}
            r={radius}
            strokeWidth={lineWidth(primitive.thickness, strokeWidth)}
            vectorEffect="non-scaling-stroke"
            fill="none"
          />
        </>
      )}
    </g>
  );
}

interface PolylinePrimitiveProps {
  readonly primitive: ImageAnnotationPoints;
  readonly primitiveIndex: number;
  readonly setIndex: number;
  readonly texts: readonly ImageAnnotationText[];
  readonly strokeWidth?: number;
  readonly selectedKey: string | null;
  readonly highlightLabel: string | null;
  readonly onSelectPrimitive?: ImageAnnotationSelectHandler;
}

function PolylinePrimitive({
  primitive,
  primitiveIndex,
  setIndex,
  texts,
  strokeWidth,
  selectedKey,
  highlightLabel,
  onSelectPrimitive,
}: PolylinePrimitiveProps) {
  const pixelTransform = useContext(ImagePixelTransformContext);
  const thickness = lineWidth(primitive.thickness, strokeWidth);
  const centroid = pointsCentroid(primitive.points);
  const label = centroid ? nearestLabel(texts, centroid) : null;
  const color = colorForLabel(label);
  const key = `p-${setIndex}-${primitiveIndex}`;
  const onClick = pickHandler(onSelectPrimitive, {
    key,
    setIndex,
    primitiveIndex,
    primitive: { kind: "points", value: primitive },
    color,
    label,
  });
  const isSelected =
    selectedKey === key ||
    (highlightLabel !== null && label === highlightLabel);
  const displayPoints = pixelTransform
    ? transformedPrimitivePoints(primitive, pixelTransform)
    : primitive.points;

  if (displayPoints.length === 0) {
    return null;
  }

  if (primitive.type === "points") {
    return (
      <g
        className={clsx(
          styles.primitive,
          onClick && styles.selectable,
          isSelected && styles.selected,
        )}
        style={primitiveStyle(color)}
        onClick={onClick}
      >
        {displayPoints.map(([x, y], i) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={thickness}
            className={styles.primitiveDot}
          />
        ))}
      </g>
    );
  }

  const closed = primitive.type === "line-loop";
  const pointsAttr = svgPoints(displayPoints);
  return (
    <g
      className={clsx(
        styles.primitive,
        onClick && styles.selectable,
        isSelected && styles.selected,
      )}
      style={primitiveStyle(color)}
      onClick={onClick}
    >
      {closed ? (
        <polygon points={pointsAttr} className={styles.fillInterior} />
      ) : null}
      {closed ? (
        <polygon
          points={pointsAttr}
          strokeWidth={thickness}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          fill="none"
        />
      ) : (
        <polyline
          points={pointsAttr}
          strokeWidth={thickness}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          fill="none"
        />
      )}
    </g>
  );
}

interface LineListGroupsProps {
  readonly primitive: ImageAnnotationPoints;
  readonly primitiveIndex: number;
  readonly setIndex: number;
  readonly texts: readonly ImageAnnotationText[];
  readonly strokeWidth?: number;
  readonly selectedKey: string | null;
  readonly highlightLabel: string | null;
  readonly onSelectPrimitive?: ImageAnnotationSelectHandler;
  readonly preparedGroups?: readonly ImageAnnotationLineListGroup[];
}

function LineListGroups({
  primitive,
  primitiveIndex,
  setIndex,
  texts,
  strokeWidth,
  selectedKey,
  highlightLabel,
  onSelectPrimitive,
  preparedGroups,
}: LineListGroupsProps) {
  const pixelTransform = useContext(ImagePixelTransformContext);
  const thickness = lineWidth(primitive.thickness, strokeWidth);
  const groups =
    preparedGroups ?? groupLineListByLabel(primitive.points, texts);

  return (
    <>
      {groups.map((group, gi) => {
        const color = colorForLabel(group.label);
        const key = `pg-${setIndex}-${primitiveIndex}-${gi}-${boundsKey(
          group.bounds,
        )}`;
        const onClick = pickHandler(onSelectPrimitive, {
          key,
          setIndex,
          primitiveIndex,
          primitive: {
            kind: "points",
            value: {
              ...primitive,
              points: group.points,
            },
          },
          color,
          label: group.label,
        });
        const isSelected =
          selectedKey === key ||
          (highlightLabel !== null && group.label === highlightLabel);
        const displaySegments = pixelTransform
          ? group.segments
              .map((segment) =>
                transformedSegment(segment[0], segment[1], pixelTransform),
              )
              .filter((segment) => segment.length >= 2)
          : group.segments;
        if (displaySegments.length === 0) {
          return null;
        }
        const b = pixelTransform
          ? (pointsBounds(displaySegments.flat()) ?? group.bounds)
          : group.bounds;
        return (
          <g
            key={gi}
            className={clsx(
              styles.primitive,
              onClick && styles.selectable,
              isSelected && styles.selected,
            )}
            style={primitiveStyle(color)}
            onClick={onClick}
          >
            <rect
              x={b.minX}
              y={b.minY}
              width={b.maxX - b.minX}
              height={b.maxY - b.minY}
              className={styles.fillInterior}
            />
            {displaySegments.map((segment, si) => (
              <Fragment key={si}>
                {pixelTransform ? (
                  <polyline
                    points={svgPoints(segment)}
                    strokeWidth={thickness}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    fill="none"
                  />
                ) : (
                  <line
                    x1={segment[0][0]}
                    y1={segment[0][1]}
                    x2={segment[1][0]}
                    y2={segment[1][1]}
                    strokeWidth={thickness}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
              </Fragment>
            ))}
          </g>
        );
      })}
    </>
  );
}

interface TextPrimitiveProps {
  readonly primitive: ImageAnnotationText;
  readonly primitiveIndex: number;
  readonly setIndex: number;
  readonly selectedKey: string | null;
  readonly highlightLabel: string | null;
  readonly onSelectPrimitive?: ImageAnnotationSelectHandler;
}

function TextPrimitive({
  primitive,
  primitiveIndex,
  setIndex,
  selectedKey,
  highlightLabel,
  onSelectPrimitive,
}: TextPrimitiveProps) {
  const pixelTransform = useContext(ImagePixelTransformContext);
  const displayPosition = pixelTransform
    ? pixelTransform(...primitive.position)
    : primitive.position;
  if (!displayPosition) {
    return null;
  }
  const [x, y] = displayPosition;
  const fontSize = Math.max(1, primitive.fontSize);
  const background = rgbaToCss(primitive.backgroundColor);
  const label = primitive.text || null;
  const color = colorForLabel(label);
  const key = `t-${setIndex}-${primitiveIndex}`;
  const onClick = pickHandler(onSelectPrimitive, {
    key,
    setIndex,
    primitiveIndex,
    primitive: { kind: "text", value: primitive },
    color,
    label,
  });
  const isSelected =
    selectedKey === key ||
    (highlightLabel !== null && label === highlightLabel);

  return (
    <g
      className={clsx(
        onClick && styles.selectable,
        isSelected && styles.selected,
      )}
      style={{ ["--ann-stroke" as never]: color } as CSSProperties}
      onClick={onClick}
    >
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
        fill={isSelected ? HOVER_STROKE : color}
        fontSize={fontSize}
        fontFamily="system-ui, sans-serif"
        dominantBaseline="alphabetic"
      >
        {primitive.text}
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Bounds = ImageAnnotationBounds;

type Point2 = readonly [number, number];

type LineListGroup = ImageAnnotationLineListGroup;

function groupLineListByLabel(
  points: readonly Point2[],
  texts: readonly ImageAnnotationText[],
): readonly LineListGroup[] {
  return groupLineSegmentsByLabel(points, texts).map(({ label, segments }) => ({
    label,
    points: segments.flatMap(([a, b]) => [a, b]),
    segments,
    bounds: segmentsBounds(segments),
  }));
}

function segmentsBounds(segments: readonly [Point2, Point2][]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [[x1, y1], [x2, y2]] of segments) {
    if (x1 < minX) minX = x1;
    if (x2 < minX) minX = x2;
    if (x1 > maxX) maxX = x1;
    if (x2 > maxX) maxX = x2;
    if (y1 < minY) minY = y1;
    if (y2 < minY) minY = y2;
    if (y1 > maxY) maxY = y1;
    if (y2 > maxY) maxY = y2;
  }
  return { minX, minY, maxX, maxY };
}

function nearestTextIndex(
  texts: readonly ImageAnnotationText[],
  point: Point2,
): number {
  let bestIdx = -1;
  let bestDist = Infinity;
  const maxSq = MAX_LABEL_DIST_PX * MAX_LABEL_DIST_PX;
  for (let i = 0; i < texts.length; i++) {
    const t = texts[i];
    if (!t.text) continue;
    const dx = t.position[0] - point[0];
    const dy = t.position[1] - point[1];
    const d = dx * dx + dy * dy;
    if (d < bestDist && d <= maxSq) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function nearestLabel(
  texts: readonly ImageAnnotationText[],
  point: Point2,
): string | null {
  const idx = nearestTextIndex(texts, point);
  return idx === -1 ? null : (texts[idx]?.text ?? null);
}

function pointsCentroid(points: readonly Point2[]): Point2 | null {
  if (points.length === 0) return null;
  let sx = 0;
  let sy = 0;
  for (const [x, y] of points) {
    sx += x;
    sy += y;
  }
  return [sx / points.length, sy / points.length];
}

function transformedCirclePoints(
  circle: ImageAnnotationCircle,
  transform: ImagePixelTransform,
): readonly Point2[] | null {
  const radius = Math.max(0, circle.diameter / 2);
  const sampleCount = Math.min(
    96,
    Math.max(24, Math.ceil((Math.PI * Math.max(1, circle.diameter)) / 8)),
  );
  const points: Point2[] = [];
  for (let index = 0; index < sampleCount; index++) {
    const angle = (Math.PI * 2 * index) / sampleCount;
    const point = transform(
      circle.position[0] + Math.cos(angle) * radius,
      circle.position[1] + Math.sin(angle) * radius,
    );
    if (!point) {
      return null;
    }
    points.push(point);
  }
  return points;
}

function transformedPrimitivePoints(
  primitive: ImageAnnotationPoints,
  transform: ImagePixelTransform,
): readonly Point2[] {
  if (primitive.type === "points") {
    return primitive.points.flatMap((point) => {
      const transformed = transform(...point);
      return transformed ? [transformed] : [];
    });
  }
  if (primitive.points.length < 2) {
    return primitive.points.flatMap((point) => {
      const transformed = transform(...point);
      return transformed ? [transformed] : [];
    });
  }

  const output: Point2[] = [];
  const segmentCount =
    primitive.type === "line-loop"
      ? primitive.points.length
      : primitive.points.length - 1;
  for (let index = 0; index < segmentCount; index++) {
    const start = primitive.points[index];
    const end = primitive.points[(index + 1) % primitive.points.length];
    const segment = transformedSegment(start, end, transform);
    if (segment.length === 0) {
      // A missing sample means the source curve left the camera model's
      // invertible domain. Withhold the whole connected primitive instead of
      // joining the valid pieces across an untrusted gap.
      return [];
    }
    output.push(...(output.length > 0 ? segment.slice(1) : segment));
  }
  return output;
}

function transformedSegment(
  start: Point2,
  end: Point2,
  transform: ImagePixelTransform,
): readonly Point2[] {
  const sourceLength = Math.hypot(end[0] - start[0], end[1] - start[1]);
  const steps = Math.min(128, Math.max(1, Math.ceil(sourceLength / 8)));
  const output: Point2[] = [];
  for (let step = 0; step <= steps; step++) {
    const fraction = step / steps;
    const point = transform(
      start[0] + (end[0] - start[0]) * fraction,
      start[1] + (end[1] - start[1]) * fraction,
    );
    if (!point) {
      return [];
    }
    output.push(point);
  }
  return output;
}

function pointsBounds(points: readonly Point2[]): Bounds | null {
  if (points.length === 0) {
    return null;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

function svgPoints(points: readonly Point2[]): string {
  return points.map(([x, y]) => `${x},${y}`).join(" ");
}

// Subset of `@fiftyone/utilities`' default app color pool with the orange
// and orange-leaning entries pulled out — those collide with the orange
// hover / selected highlight (#ff7a18).
const MAX_LABEL_DIST_PX = 200;

const DEFAULT_COLOR_POOL: readonly string[] = [
  "#ee0000",
  "#999900",
  "#009900",
  "#003300",
  "#009999",
  "#000099",
  "#0066ff",
  "#6600ff",
  "#cc33cc",
  "#777799",
];

const DEFAULT_LABEL_KEY = "__no-label__";

function colorForLabel(label: string | null): string {
  const key = label ?? DEFAULT_LABEL_KEY;
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return DEFAULT_COLOR_POOL[hash % DEFAULT_COLOR_POOL.length];
}

function boundsKey(b: Bounds): string {
  const r = (v: number) => Math.round(v / 20);
  return `${r(b.minX)}|${r(b.minY)}|${r(b.maxX - b.minX)}|${r(
    b.maxY - b.minY,
  )}`;
}

function primitiveStyle(color: string): CSSProperties {
  return { "--ann-stroke": color } as CSSProperties;
}

function pickHandler(
  onSelectPrimitive: ImageAnnotationSelectHandler | undefined,
  picked: ImageAnnotationPickedPrimitive,
): ((e: React.MouseEvent) => void) | undefined {
  if (!onSelectPrimitive) return undefined;
  return (e) => {
    e.stopPropagation();
    onSelectPrimitive(picked, { shiftKey: e.shiftKey });
  };
}

function lineWidth(thickness: number, override?: number): number {
  if (typeof override === "number" && Number.isFinite(override)) {
    return Math.max(0, override);
  }

  // Strokes are non-scaling (screen px); render source thickness as-is so
  // 2D line work reads as light as the 3D scene's 1px lines.
  return Math.max(1, thickness);
}

function rgbaToCss(color: RgbaColor | null | undefined): string | undefined {
  if (!color) return undefined;
  const [r, g, b, a] = color;
  const r255 = clamp01(r) * 255;
  const g255 = clamp01(g) * 255;
  const b255 = clamp01(b) * 255;
  return `rgba(${r255.toFixed(0)}, ${g255.toFixed(0)}, ${b255.toFixed(
    0,
  )}, ${clamp01(a).toFixed(3)})`;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v <= 0) return 0;
  if (v >= 1) return 1;
  return v;
}

const HOVER_STROKE = "#ff7a18";

const containerStyle: CSSProperties = {
  inset: 0,
  pointerEvents: "none",
  position: "absolute",
};

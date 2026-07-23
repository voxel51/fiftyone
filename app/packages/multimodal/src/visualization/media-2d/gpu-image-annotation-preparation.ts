import * as THREE from "three";

import type {
  ImageAnnotationCircle,
  ImageAnnotationPoints,
  ImageAnnotationText,
  ImageAnnotationsVisualization,
} from "../../ir";
import { groupLineSegmentsByLabel } from "./line-segment-grouping";
import type {
  ImageAnnotationBounds,
  ImageAnnotationLineListGroup,
  ImageAnnotationRenderMetadata,
} from "./image-annotation-render-metadata";

/** Maps a source image pixel into the displayed image's pixel space. */
export type ImagePixelTransform = (
  u: number,
  v: number,
) => readonly [number, number] | null;

/** Shape payload retained for selection and tooltip reconstruction. */
export type ImageAnnotationPrimitive =
  | { readonly kind: "circle"; readonly value: ImageAnnotationCircle }
  | { readonly kind: "points"; readonly value: ImageAnnotationPoints };

/** One decoded annotation stream and its optional prepared grouping metadata. */
export interface ImageAnnotationSetInput {
  readonly frame: ImageAnnotationsVisualization;
  readonly renderMetadata?: ImageAnnotationRenderMetadata;
  readonly stream: string;
}

/** Stable identity and presentation metadata for one selectable shape. */
export interface PreparedImageAnnotationMetadata {
  readonly color: string;
  readonly key: string;
  readonly label: string | null;
  readonly primitive: ImageAnnotationPrimitive;
  readonly primitiveIndex: number;
  readonly stream: string;
}

/** Flat instance arrays for filled points and outlined circles. */
export interface PreparedImageAnnotationPoints {
  readonly centers: Float32Array;
  readonly colors: Float32Array;
  readonly count: number;
  readonly diameters: Float32Array;
  /** 0 = filled point, 1 = outlined circle. */
  readonly kinds: Float32Array;
  readonly primitiveIndices: Uint32Array;
  readonly thicknesses: Float32Array;
}

/** Flat instance arrays for capsule-rendered line segments. */
export interface PreparedImageAnnotationSegments {
  readonly colors: Float32Array;
  readonly count: number;
  readonly ends: Float32Array;
  readonly primitiveIndices: Uint32Array;
  readonly starts: Float32Array;
  readonly thicknesses: Float32Array;
}

/** Analytic candidate kinds consumed by the integer GPU picker. */
export const IMAGE_ANNOTATION_PICK_KIND = {
  DISC: 0,
  SEGMENT: 1,
  RECT: 2,
  TRIANGLE: 3,
} as const;

/** Flat analytic candidates used by the on-demand GPU pick pass. */
export interface PreparedImageAnnotationPicks {
  readonly a: Float32Array;
  readonly b: Float32Array;
  readonly c: Float32Array;
  readonly count: number;
  readonly kinds: Float32Array;
  readonly orders: Float32Array;
  readonly primitiveIndices: Uint32Array;
  /** Disc radius for DISC candidates; unused by other candidate kinds. */
  readonly radii: Float32Array;
}

/** Renderer-neutral geometry, picking, and tooltip data for one image frame. */
export interface PreparedImageAnnotations {
  readonly metadata: readonly PreparedImageAnnotationMetadata[];
  readonly picks: PreparedImageAnnotationPicks;
  /** Prefix offsets into `points`, indexed by metadata index. */
  readonly pointOffsets: Uint32Array;
  readonly points: PreparedImageAnnotationPoints;
  /** Prefix offsets into `segments`, indexed by metadata index. */
  readonly segmentOffsets: Uint32Array;
  readonly segments: PreparedImageAnnotationSegments;
}

type Point2 = readonly [number, number];

interface MutablePointBatch {
  readonly centers: number[];
  readonly colors: number[];
  readonly diameters: number[];
  readonly kinds: number[];
  readonly primitiveIndices: number[];
  readonly thicknesses: number[];
}

interface MutableSegmentBatch {
  readonly colors: number[];
  readonly ends: number[];
  readonly primitiveIndices: number[];
  readonly starts: number[];
  readonly thicknesses: number[];
}

interface MutablePickBatch {
  readonly a: number[];
  readonly b: number[];
  readonly c: number[];
  readonly kinds: number[];
  readonly orders: number[];
  readonly primitiveIndices: number[];
  readonly radii: number[];
}

interface PreparationState {
  readonly metadata: PreparedImageAnnotationMetadata[];
  readonly picks: MutablePickBatch;
  readonly points: MutablePointBatch;
  readonly segments: MutableSegmentBatch;
}

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
const MAX_LABEL_DIST_PX = 200;
const TEXT_INDEX_CELL_SIZE = MAX_LABEL_DIST_PX;
const CURVE_ERROR_TOLERANCE_PX = 0.25;
const CURVE_MAX_SOURCE_STEP_PX = 32;
const CURVE_MAX_DEPTH = 8;

/**
 * Flattens decoded annotation messages into renderer-owned batches.
 *
 * Text primitives are deliberately retained only as metadata associations;
 * they never contribute visible or pick geometry.
 */
export function prepareImageAnnotations(
  sets: readonly ImageAnnotationSetInput[],
  pixelTransform?: ImagePixelTransform,
): PreparedImageAnnotations {
  const state: PreparationState = {
    metadata: [],
    picks: mutablePickBatch(),
    points: mutablePointBatch(),
    segments: mutableSegmentBatch(),
  };

  for (const set of sets) {
    prepareSet(state, set, pixelTransform);
  }

  return freezePrepared(state);
}

/**
 * Extracts highlighted geometry without mutating or rebuilding the base GPU
 * resource. Pick candidates are intentionally omitted from the highlight pass.
 */
export function prepareImageAnnotationHighlight(
  prepared: PreparedImageAnnotations,
  primitiveIndices: ReadonlySet<number>,
  color = "#ff7a18",
): PreparedImageAnnotations {
  if (primitiveIndices.size === 0) {
    return EMPTY_PREPARED_IMAGE_ANNOTATIONS;
  }

  const rgb = colorRgb(color);
  const points = mutablePointBatch();
  const segments = mutableSegmentBatch();

  const sortedPrimitiveIndices = [...primitiveIndices].sort(
    (left, right) => left - right,
  );
  for (const primitiveIndex of sortedPrimitiveIndices) {
    const start = prepared.pointOffsets[primitiveIndex];
    const end = prepared.pointOffsets[primitiveIndex + 1];
    for (let index = start; index < end; index++) {
      points.centers.push(
        prepared.points.centers[index * 2],
        prepared.points.centers[index * 2 + 1],
      );
      points.colors.push(...rgb);
      points.diameters.push(prepared.points.diameters[index]);
      points.kinds.push(prepared.points.kinds[index]);
      points.primitiveIndices.push(prepared.points.primitiveIndices[index]);
      points.thicknesses.push(prepared.points.thicknesses[index] + 2);
    }
  }

  for (const primitiveIndex of sortedPrimitiveIndices) {
    const start = prepared.segmentOffsets[primitiveIndex];
    const end = prepared.segmentOffsets[primitiveIndex + 1];
    for (let index = start; index < end; index++) {
      segments.starts.push(
        prepared.segments.starts[index * 2],
        prepared.segments.starts[index * 2 + 1],
      );
      segments.ends.push(
        prepared.segments.ends[index * 2],
        prepared.segments.ends[index * 2 + 1],
      );
      segments.colors.push(...rgb);
      segments.primitiveIndices.push(prepared.segments.primitiveIndices[index]);
      segments.thicknesses.push(prepared.segments.thicknesses[index] + 2);
    }
  }

  const frozenPoints = freezePoints(points);
  const frozenSegments = freezeSegments(segments);
  return {
    metadata: prepared.metadata,
    picks: EMPTY_PREPARED_IMAGE_ANNOTATIONS.picks,
    pointOffsets: batchOffsets(
      frozenPoints.primitiveIndices,
      prepared.metadata.length,
    ),
    points: frozenPoints,
    segmentOffsets: batchOffsets(
      frozenSegments.primitiveIndices,
      prepared.metadata.length,
    ),
    segments: frozenSegments,
  };
}

/** Shared immutable empty payload for inactive base and highlight layers. */
export const EMPTY_PREPARED_IMAGE_ANNOTATIONS: PreparedImageAnnotations = {
  metadata: [],
  picks: freezePicks(mutablePickBatch()),
  pointOffsets: new Uint32Array([0]),
  points: freezePoints(mutablePointBatch()),
  segmentOffsets: new Uint32Array([0]),
  segments: freezeSegments(mutableSegmentBatch()),
};

function prepareSet(
  state: PreparationState,
  { frame, renderMetadata, stream }: ImageAnnotationSetInput,
  pixelTransform: ImagePixelTransform | undefined,
): void {
  const textIndex = new TextSpatialIndex(frame.texts);

  for (
    let primitiveIndex = 0;
    primitiveIndex < frame.points.length;
    primitiveIndex++
  ) {
    const primitive = frame.points[primitiveIndex];
    if (primitive.type === "line-list") {
      const groups =
        renderMetadata?.lineListGroups[primitiveIndex] ??
        lineListGroups(primitive, frame.texts);
      prepareLineList(
        state,
        primitive,
        primitiveIndex,
        groups,
        stream,
        pixelTransform,
      );
      continue;
    }
    preparePointsPrimitive(
      state,
      primitive,
      primitiveIndex,
      stream,
      textIndex,
      pixelTransform,
    );
  }

  for (
    let primitiveIndex = 0;
    primitiveIndex < frame.circles.length;
    primitiveIndex++
  ) {
    prepareCircle(
      state,
      frame.circles[primitiveIndex],
      primitiveIndex,
      stream,
      textIndex,
      pixelTransform,
    );
  }
}

function preparePointsPrimitive(
  state: PreparationState,
  primitive: ImageAnnotationPoints,
  primitiveIndex: number,
  stream: string,
  textIndex: TextSpatialIndex,
  pixelTransform: ImagePixelTransform | undefined,
): void {
  const centroid = pointsCentroid(primitive.points);
  const label = centroid ? textIndex.nearestLabel(centroid) : null;
  const metadataIndex = addMetadata(state, {
    key: `p-${primitiveIndex}`,
    label,
    primitive: { kind: "points", value: primitive },
    primitiveIndex,
    stream,
  });
  const color = colorRgb(state.metadata[metadataIndex].color);
  const thickness = lineWidth(primitive.thickness);

  if (primitive.type === "points") {
    for (const source of primitive.points) {
      const point = pixelTransform ? pixelTransform(...source) : source;
      if (!point) continue;
      addPoint(state, {
        center: point,
        color,
        diameter: thickness * 2,
        kind: 0,
        metadataIndex,
        thickness,
      });
      addDiscPick(state, point, thickness, metadataIndex);
    }
    return;
  }

  const closed = primitive.type === "line-loop";
  const displayPoints = transformedConnectedPoints(
    primitive.points,
    closed,
    pixelTransform,
  );
  if (displayPoints.length === 0) {
    return;
  }
  addConnectedSegments(
    state,
    displayPoints,
    closed,
    thickness,
    color,
    metadataIndex,
  );
  if (closed) {
    addPolygonPicks(state, displayPoints, metadataIndex);
  }
}

function prepareLineList(
  state: PreparationState,
  primitive: ImageAnnotationPoints,
  primitiveIndex: number,
  groups: readonly ImageAnnotationLineListGroup[],
  stream: string,
  pixelTransform: ImagePixelTransform | undefined,
): void {
  const thickness = lineWidth(primitive.thickness);
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    const group = groups[groupIndex];
    const metadataIndex = addMetadata(state, {
      key: `pg-${primitiveIndex}-${groupIndex}-${boundsKey(group.bounds)}`,
      label: group.label,
      primitive: {
        kind: "points",
        value: { ...primitive, points: group.points },
      },
      primitiveIndex,
      stream,
    });
    const color = colorRgb(state.metadata[metadataIndex].color);
    const displaySegments: Array<readonly [Point2, Point2]> = [];

    for (const [start, end] of group.segments) {
      const transformed = transformedSegment(start, end, pixelTransform);
      if (transformed.length < 2) continue;
      for (let index = 1; index < transformed.length; index++) {
        const segment = [transformed[index - 1], transformed[index]] as const;
        displaySegments.push(segment);
        addSegment(
          state,
          segment[0],
          segment[1],
          thickness,
          color,
          metadataIndex,
        );
      }
    }

    const displayBounds = segmentsBounds(displaySegments);
    if (displayBounds) {
      addRectPick(state, displayBounds, metadataIndex);
    }
  }
}

function prepareCircle(
  state: PreparationState,
  primitive: ImageAnnotationCircle,
  primitiveIndex: number,
  stream: string,
  textIndex: TextSpatialIndex,
  pixelTransform: ImagePixelTransform | undefined,
): void {
  const label = textIndex.nearestLabel(primitive.position);
  const metadataIndex = addMetadata(state, {
    key: `c-${primitiveIndex}`,
    label,
    primitive: { kind: "circle", value: primitive },
    primitiveIndex,
    stream,
  });
  const color = colorRgb(state.metadata[metadataIndex].color);
  const thickness = lineWidth(primitive.thickness);
  const diameter = Math.max(0, primitive.diameter);

  if (!pixelTransform) {
    addPoint(state, {
      center: primitive.position,
      color,
      diameter,
      kind: 1,
      metadataIndex,
      thickness,
    });
    addDiscPick(state, primitive.position, diameter / 2, metadataIndex);
    return;
  }

  const transformed = transformedCirclePoints(primitive, pixelTransform);
  if (transformed.length === 0) {
    return;
  }
  addConnectedSegments(
    state,
    transformed,
    true,
    thickness,
    color,
    metadataIndex,
  );
  addPolygonPicks(state, transformed, metadataIndex);
}

function addMetadata(
  state: PreparationState,
  metadata: Omit<PreparedImageAnnotationMetadata, "color">,
): number {
  const index = state.metadata.length;
  state.metadata.push({ ...metadata, color: colorForLabel(metadata.label) });
  return index;
}

function addPoint(
  state: PreparationState,
  {
    center,
    color,
    diameter,
    kind,
    metadataIndex,
    thickness,
  }: {
    readonly center: Point2;
    readonly color: readonly [number, number, number];
    readonly diameter: number;
    readonly kind: number;
    readonly metadataIndex: number;
    readonly thickness: number;
  },
): void {
  state.points.centers.push(center[0], center[1]);
  state.points.colors.push(...color);
  state.points.diameters.push(Math.max(0, diameter));
  state.points.kinds.push(kind);
  state.points.primitiveIndices.push(metadataIndex);
  state.points.thicknesses.push(thickness);
}

function addConnectedSegments(
  state: PreparationState,
  points: readonly Point2[],
  closed: boolean,
  thickness: number,
  color: readonly [number, number, number],
  metadataIndex: number,
): void {
  const segmentCount = closed ? points.length : points.length - 1;
  for (let index = 0; index < segmentCount; index++) {
    addSegment(
      state,
      points[index],
      points[(index + 1) % points.length],
      thickness,
      color,
      metadataIndex,
    );
  }
}

function addSegment(
  state: PreparationState,
  start: Point2,
  end: Point2,
  thickness: number,
  color: readonly [number, number, number],
  metadataIndex: number,
): void {
  if (
    !Number.isFinite(start[0]) ||
    !Number.isFinite(start[1]) ||
    !Number.isFinite(end[0]) ||
    !Number.isFinite(end[1])
  ) {
    return;
  }
  state.segments.starts.push(start[0], start[1]);
  state.segments.ends.push(end[0], end[1]);
  state.segments.colors.push(...color);
  state.segments.primitiveIndices.push(metadataIndex);
  state.segments.thicknesses.push(thickness);
  addSegmentPick(state, start, end, metadataIndex);
}

function addDiscPick(
  state: PreparationState,
  center: Point2,
  radius: number,
  metadataIndex: number,
): void {
  addPickCandidate(state, {
    a: center,
    b: center,
    c: center,
    kind: IMAGE_ANNOTATION_PICK_KIND.DISC,
    metadataIndex,
    radius: Math.max(0, radius),
  });
}

function addSegmentPick(
  state: PreparationState,
  start: Point2,
  end: Point2,
  metadataIndex: number,
): void {
  addPickCandidate(state, {
    a: start,
    b: end,
    c: end,
    kind: IMAGE_ANNOTATION_PICK_KIND.SEGMENT,
    metadataIndex,
    radius: 0,
  });
}

function addRectPick(
  state: PreparationState,
  bounds: ImageAnnotationBounds,
  metadataIndex: number,
): void {
  addPickCandidate(state, {
    a: [bounds.minX, bounds.minY],
    b: [bounds.maxX, bounds.maxY],
    c: [bounds.maxX, bounds.maxY],
    kind: IMAGE_ANNOTATION_PICK_KIND.RECT,
    metadataIndex,
    radius: 0,
  });
}

function addPolygonPicks(
  state: PreparationState,
  points: readonly Point2[],
  metadataIndex: number,
): void {
  if (points.length < 3) return;
  const contour = points.map(([x, y]) => new THREE.Vector2(x, y));
  const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
  for (const [aIndex, bIndex, cIndex] of triangles) {
    addPickCandidate(state, {
      a: points[aIndex],
      b: points[bIndex],
      c: points[cIndex],
      kind: IMAGE_ANNOTATION_PICK_KIND.TRIANGLE,
      metadataIndex,
      radius: 0,
    });
  }
}

function addPickCandidate(
  state: PreparationState,
  {
    a,
    b,
    c,
    kind,
    metadataIndex,
    radius,
  }: {
    readonly a: Point2;
    readonly b: Point2;
    readonly c: Point2;
    readonly kind: number;
    readonly metadataIndex: number;
    readonly radius: number;
  },
): void {
  state.picks.a.push(a[0], a[1]);
  state.picks.b.push(b[0], b[1]);
  state.picks.c.push(c[0], c[1]);
  state.picks.kinds.push(kind);
  state.picks.orders.push(metadataIndex);
  state.picks.primitiveIndices.push(metadataIndex);
  state.picks.radii.push(radius);
}

function transformedConnectedPoints(
  points: readonly Point2[],
  closed: boolean,
  transform: ImagePixelTransform | undefined,
): readonly Point2[] {
  if (!transform) return points;
  if (points.length < 2) {
    const point = points[0] ? transform(...points[0]) : null;
    return point ? [point] : [];
  }

  const output: Point2[] = [];
  const segmentCount = closed ? points.length : points.length - 1;
  for (let index = 0; index < segmentCount; index++) {
    const segment = transformedSegment(
      points[index],
      points[(index + 1) % points.length],
      transform,
    );
    if (segment.length === 0) {
      return [];
    }
    output.push(...(output.length > 0 ? segment.slice(1) : segment));
  }
  if (closed && samePoint(output[0], output[output.length - 1])) {
    output.pop();
  }
  return output;
}

function transformedSegment(
  start: Point2,
  end: Point2,
  transform: ImagePixelTransform | undefined,
): readonly Point2[] {
  if (!transform) return [start, end];
  const transformedStart = transform(...start);
  const transformedEnd = transform(...end);
  if (!transformedStart || !transformedEnd) return [];
  const output: Point2[] = [transformedStart];
  const valid = appendAdaptiveSegment(
    output,
    start,
    transformedStart,
    end,
    transformedEnd,
    transform,
    0,
  );
  return valid ? output : [];
}

function appendAdaptiveSegment(
  output: Point2[],
  sourceStart: Point2,
  displayStart: Point2,
  sourceEnd: Point2,
  displayEnd: Point2,
  transform: ImagePixelTransform,
  depth: number,
): boolean {
  const sourceMidpoint: Point2 = [
    (sourceStart[0] + sourceEnd[0]) / 2,
    (sourceStart[1] + sourceEnd[1]) / 2,
  ];
  const displayMidpoint = transform(...sourceMidpoint);
  if (!displayMidpoint) return false;

  const linearMidpoint: Point2 = [
    (displayStart[0] + displayEnd[0]) / 2,
    (displayStart[1] + displayEnd[1]) / 2,
  ];
  const error = Math.hypot(
    displayMidpoint[0] - linearMidpoint[0],
    displayMidpoint[1] - linearMidpoint[1],
  );
  const sourceLength = Math.hypot(
    sourceEnd[0] - sourceStart[0],
    sourceEnd[1] - sourceStart[1],
  );
  const subdivide =
    depth < CURVE_MAX_DEPTH &&
    (error > CURVE_ERROR_TOLERANCE_PX ||
      sourceLength > CURVE_MAX_SOURCE_STEP_PX);

  if (subdivide) {
    if (
      !appendAdaptiveSegment(
        output,
        sourceStart,
        displayStart,
        sourceMidpoint,
        displayMidpoint,
        transform,
        depth + 1,
      )
    ) {
      return false;
    }
    return appendAdaptiveSegment(
      output,
      sourceMidpoint,
      displayMidpoint,
      sourceEnd,
      displayEnd,
      transform,
      depth + 1,
    );
  }

  output.push(displayEnd);
  return true;
}

function transformedCirclePoints(
  circle: ImageAnnotationCircle,
  transform: ImagePixelTransform,
): readonly Point2[] {
  const radius = Math.max(0, circle.diameter / 2);
  const source: Point2[] = [];
  for (let index = 0; index < 8; index++) {
    const angle = (Math.PI * 2 * index) / 8;
    source.push([
      circle.position[0] + Math.cos(angle) * radius,
      circle.position[1] + Math.sin(angle) * radius,
    ]);
  }
  return transformedConnectedPoints(source, true, transform);
}

function lineListGroups(
  primitive: ImageAnnotationPoints,
  texts: readonly ImageAnnotationText[],
): readonly ImageAnnotationLineListGroup[] {
  return groupLineSegmentsByLabel(primitive.points, texts).map(
    ({ label, segments }) => ({
      bounds: segmentsBounds(segments) ?? {
        minX: 0,
        minY: 0,
        maxX: 0,
        maxY: 0,
      },
      label,
      points: segments.flatMap(([a, b]) => [a, b]),
      segments,
    }),
  );
}

function segmentsBounds(
  segments: readonly (readonly [Point2, Point2])[],
): ImageAnnotationBounds | null {
  if (segments.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [[x1, y1], [x2, y2]] of segments) {
    minX = Math.min(minX, x1, x2);
    minY = Math.min(minY, y1, y2);
    maxX = Math.max(maxX, x1, x2);
    maxY = Math.max(maxY, y1, y2);
  }
  return { minX, minY, maxX, maxY };
}

function pointsCentroid(points: readonly Point2[]): Point2 | null {
  if (points.length === 0) return null;
  let x = 0;
  let y = 0;
  for (const point of points) {
    x += point[0];
    y += point[1];
  }
  return [x / points.length, y / points.length];
}

class TextSpatialIndex {
  private readonly cells = new Map<string, number[]>();

  constructor(private readonly texts: readonly ImageAnnotationText[]) {
    for (let index = 0; index < texts.length; index++) {
      const text = texts[index];
      if (!text.text) continue;
      const key = cellKey(text.position);
      const cell = this.cells.get(key);
      if (cell) cell.push(index);
      else this.cells.set(key, [index]);
    }
  }

  nearestLabel(point: Point2): string | null {
    const cellX = Math.floor(point[0] / TEXT_INDEX_CELL_SIZE);
    const cellY = Math.floor(point[1] / TEXT_INDEX_CELL_SIZE);
    const maxSq = MAX_LABEL_DIST_PX * MAX_LABEL_DIST_PX;
    let bestDistance = Infinity;
    let bestLabel: string | null = null;

    for (let y = cellY - 1; y <= cellY + 1; y++) {
      for (let x = cellX - 1; x <= cellX + 1; x++) {
        const candidates = this.cells.get(`${x}|${y}`);
        if (!candidates) continue;
        for (const index of candidates) {
          const text = this.texts[index];
          const dx = text.position[0] - point[0];
          const dy = text.position[1] - point[1];
          const distance = dx * dx + dy * dy;
          if (distance <= maxSq && distance < bestDistance) {
            bestDistance = distance;
            bestLabel = text.text || null;
          }
        }
      }
    }
    return bestLabel;
  }
}

function cellKey(point: Point2): string {
  return `${Math.floor(point[0] / TEXT_INDEX_CELL_SIZE)}|${Math.floor(
    point[1] / TEXT_INDEX_CELL_SIZE,
  )}`;
}

function colorForLabel(label: string | null): string {
  const key = label ?? DEFAULT_LABEL_KEY;
  let hash = 0;
  for (let index = 0; index < key.length; index++) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }
  return DEFAULT_COLOR_POOL[hash % DEFAULT_COLOR_POOL.length];
}

function colorRgb(color: string): readonly [number, number, number] {
  const parsed = new THREE.Color(color);
  return [parsed.r, parsed.g, parsed.b];
}

function lineWidth(thickness: number): number {
  return Number.isFinite(thickness) ? Math.max(1, thickness) : 1;
}

function boundsKey(bounds: ImageAnnotationBounds): string {
  const rounded = (value: number) => Math.round(value / 20);
  return `${rounded(bounds.minX)}|${rounded(bounds.minY)}|${rounded(
    bounds.maxX - bounds.minX,
  )}|${rounded(bounds.maxY - bounds.minY)}`;
}

function samePoint(first: Point2 | undefined, second: Point2 | undefined) {
  return (
    first !== undefined &&
    second !== undefined &&
    first[0] === second[0] &&
    first[1] === second[1]
  );
}

function mutablePointBatch(): MutablePointBatch {
  return {
    centers: [],
    colors: [],
    diameters: [],
    kinds: [],
    primitiveIndices: [],
    thicknesses: [],
  };
}

function mutableSegmentBatch(): MutableSegmentBatch {
  return {
    colors: [],
    ends: [],
    primitiveIndices: [],
    starts: [],
    thicknesses: [],
  };
}

function mutablePickBatch(): MutablePickBatch {
  return {
    a: [],
    b: [],
    c: [],
    kinds: [],
    orders: [],
    primitiveIndices: [],
    radii: [],
  };
}

function freezePrepared(state: PreparationState): PreparedImageAnnotations {
  const points = freezePoints(state.points);
  const segments = freezeSegments(state.segments);
  return {
    metadata: state.metadata,
    picks: freezePicks(state.picks),
    pointOffsets: batchOffsets(points.primitiveIndices, state.metadata.length),
    points,
    segmentOffsets: batchOffsets(
      segments.primitiveIndices,
      state.metadata.length,
    ),
    segments,
  };
}

function batchOffsets(
  primitiveIndices: Uint32Array,
  primitiveCount: number,
): Uint32Array {
  const offsets = new Uint32Array(primitiveCount + 1);
  for (const primitiveIndex of primitiveIndices) {
    if (primitiveIndex < primitiveCount) offsets[primitiveIndex + 1] += 1;
  }
  for (let index = 1; index < offsets.length; index++) {
    offsets[index] += offsets[index - 1];
  }
  return offsets;
}

function freezePoints(
  points: MutablePointBatch,
): PreparedImageAnnotationPoints {
  return {
    centers: new Float32Array(points.centers),
    colors: new Float32Array(points.colors),
    count: points.diameters.length,
    diameters: new Float32Array(points.diameters),
    kinds: new Float32Array(points.kinds),
    primitiveIndices: new Uint32Array(points.primitiveIndices),
    thicknesses: new Float32Array(points.thicknesses),
  };
}

function freezeSegments(
  segments: MutableSegmentBatch,
): PreparedImageAnnotationSegments {
  return {
    colors: new Float32Array(segments.colors),
    count: segments.thicknesses.length,
    ends: new Float32Array(segments.ends),
    primitiveIndices: new Uint32Array(segments.primitiveIndices),
    starts: new Float32Array(segments.starts),
    thicknesses: new Float32Array(segments.thicknesses),
  };
}

function freezePicks(picks: MutablePickBatch): PreparedImageAnnotationPicks {
  return {
    a: new Float32Array(picks.a),
    b: new Float32Array(picks.b),
    c: new Float32Array(picks.c),
    count: picks.kinds.length,
    kinds: new Float32Array(picks.kinds),
    orders: new Float32Array(picks.orders),
    primitiveIndices: new Uint32Array(picks.primitiveIndices),
    radii: new Float32Array(picks.radii),
  };
}

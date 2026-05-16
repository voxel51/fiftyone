/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  EDGE_THRESHOLD,
  LABEL_ARCHETYPE_PRIORITY,
  PREVIEW_LINE_OPACITY,
} from "../constants";
import type { Renderer2D } from "../renderer/Renderer2D";
import type { DrawStyle, Point, RawLookerLabel } from "../types";
import {
  distance,
  distanceFromLineSegment,
  projectOntoSegment2d,
} from "../utils/geometry";
import {
  KeypointOverlay,
  type KeypointLabel,
  type KeypointRenderContext,
} from "./KeypointOverlay";

export type PolylineLabel = RawLookerLabel & {
  label?: string;
  points?: [number, number][][];
  closed?: boolean;
  filled?: boolean;
};

export interface PolylineOptions {
  id: string;
  label: PolylineLabel;
  field: string;
  draggable?: boolean;
  deletable?: boolean;
  selectable?: boolean;
  variantStyles?: Record<string, DrawStyle>;
}

const DEFAULT_FILL_OPACITY = 0.3;

export type SegmentEndpoint = {
  segmentIdx: number;
  end: "head" | "tail";
} | null;

/**
 * Flattens a polyline's nested points into a single array, emitting one
 * `connections` path per segment with sequential indices and a parallel
 * `segmentBoundaries` array marking the end-index of each segment.
 */
const flattenPolylinePoints = (
  segments: [number, number][][]
): {
  flatPoints: [number, number][];
  connections: number[][];
  segmentBoundaries: number[];
} => {
  const flatPoints: [number, number][] = [];
  const connections: number[][] = [];
  const segmentBoundaries: number[] = [];

  for (const segment of segments) {
    const indices: number[] = [];
    for (const p of segment) {
      indices.push(flatPoints.length);
      flatPoints.push([p[0], p[1]]);
    }
    if (indices.length > 0) {
      connections.push(indices);
    }
    segmentBoundaries.push(flatPoints.length);
  }

  return { flatPoints, connections, segmentBoundaries };
};

/**
 * 2D polyline overlay.
 *
 * Reuses {@link KeypointOverlay}'s point/edge geometry, hit-testing, and
 * selection/hover rendering. The polyline label's nested `points` array is
 * flattened into a single point list at construction time, with one
 * `connections` path per segment so multi-segment edge rendering is automatic.
 *
 * For persistence, callers should read points back via {@link getNestedPoints}
 * to recover the original `[[number, number][], ...]` shape.
 */
export class PolylineOverlay extends KeypointOverlay {
  private segmentBoundaries: number[];
  private polylineClosed: boolean;
  private polylineFilled: boolean;

  /**
   * Segment that the preview line should anchor against. When `null`, the
   * preview anchors to whichever endpoint is globally nearest the cursor.
   */
  private previewAnchorSegmentIdx: number | null = null;

  /**
   * When `true`, the preview line anchors against the segment's far endpoint
   * instead of the nearest — mirrors the meta-key flip in the interactive
   * handler so the dashed telegraph matches what a click will produce.
   */
  private previewAnchorFlipped = false;

  /**
   * Sticky-extension override: when set, the preview line anchors against
   * this specific point instead of the segment's nearest endpoint. Mirrors
   * the {@link InteractivePolylineHandler}'s last-extended point id so the
   * dashed preview matches the click target. The meta-flip flag takes
   * precedence — pressing meta still telegraphs (and produces) a swap to
   * the opposite endpoint of the active segment.
   */
  private previewAnchorPointId: string | null = null;

  constructor(options: PolylineOptions) {
    const { flatPoints, connections, segmentBoundaries } =
      flattenPolylinePoints(options.label.points ?? []);

    // Synthesize a Keypoint-compatible label so the parent's render machinery
    // operates on a flat point list
    const flatLabel = {
      ...options.label,
      points: flatPoints,
    } as unknown as KeypointLabel;

    super({
      id: options.id,
      field: options.field,
      label: flatLabel,
      connections,
      closed: options.label.closed ?? false,
      draggable: options.draggable,
      deletable: options.deletable,
      selectable: options.selectable,
      variantStyles: options.variantStyles,
    });

    this.label = options.label as unknown as KeypointLabel;
    this.segmentBoundaries = segmentBoundaries;
    this.polylineClosed = options.label.closed ?? false;
    this.polylineFilled = options.label.filled ?? false;
  }

  override getOverlayType(): string {
    return "PolylineOverlay";
  }

  override updateLabel(label: PolylineLabel): void {
    super.updateLabel(label as unknown as KeypointLabel);

    const { flatPoints, connections, segmentBoundaries } =
      flattenPolylinePoints(label.points ?? []);

    this.segmentBoundaries = segmentBoundaries;
    this.polylineClosed = label.closed ?? false;
    this.polylineFilled = label.filled ?? false;

    this.setRelativePoints(flatPoints);
    this.setConnections(connections);
    this.setClosed(this.polylineClosed);
  }

  override getSelectionPriority(): number {
    const base = super.getSelectionPriority();
    return base < 0 ? base : LABEL_ARCHETYPE_PRIORITY.POLYLINE;
  }

  override getTooltipInfo() {
    return {
      color: this.currentStyle?.strokeStyle ?? "#ffffff",
      field: this.field || "unknown",
      label: this.label,
      type: "Polyline",
    };
  }

  /**
   * Reconstructs the polyline points in their original nested form, suitable
   * for persistence as a `[[number, number][], ...]` label.
   *
   * @returns One `[x, y]` array per segment, in segment order.
   *   Empty segments (created via {@link startNewSegment} but not yet
   *   populated) appear as empty arrays.
   */
  getNestedPoints(): [number, number][][] {
    const flat = this.getRelativePoints();
    const segments: [number, number][][] = [];
    let prev = 0;
    for (const end of this.segmentBoundaries) {
      segments.push(flat.slice(prev, end));
      prev = end;
    }
    return segments;
  }

  getClosed(): boolean {
    return this.polylineClosed;
  }

  getFilled(): boolean {
    return this.polylineFilled;
  }

  /**
   * Returns the number of segments, including any empty segments created via
   * {@link startNewSegment} that haven't yet had a point added.
   */
  getSegmentCount(): number {
    return this.segmentBoundaries.length;
  }

  /**
   * Returns the number of points in `segmentIdx`, or `0` if the index is
   * out of range.
   *
   * @param segmentIdx Zero-based segment index.
   */
  getSegmentLength(segmentIdx: number): number {
    if (segmentIdx < 0 || segmentIdx >= this.segmentBoundaries.length) {
      return 0;
    }

    const segStart = this.segmentStart(segmentIdx);
    return this.segmentBoundaries[segmentIdx] - segStart;
  }

  /**
   * Appends a point at the end of the last segment (creating one if none
   * exist). Use {@link appendPointToSegment} or {@link insertPointInSegment}
   * to target a specific segment.
   *
   * @param worldPoint Absolute (world-space) coordinates of the new point.
   * @param variant Optional variant key used to determine render style.
   * @param id Optional point id; one is generated when omitted.
   * @returns The id of the new point.
   */
  override addPoint(worldPoint: Point, variant?: string, id?: string): string {
    // Bump boundaries BEFORE super, since `super.addPoint` synchronously
    // dispatches `lighter:keypoint-point-added`.
    if (this.segmentBoundaries.length === 0) {
      this.segmentBoundaries.push(1);
    } else {
      this.segmentBoundaries[this.segmentBoundaries.length - 1] += 1;
    }

    const newId = super.addPoint(worldPoint, variant, id);

    this.setConnections(this.rebuildConnectionsFromBoundaries());

    return newId;
  }

  /**
   * Removes the point at the given flat-array index. The owning segment is
   * inferred from `segmentBoundaries`; if removal empties a segment, the
   * segment slot is dropped.
   *
   * @param index Flat-array index of the point to remove (across all segments).
   *   Out-of-range indices are silently ignored, as are calls when the overlay
   *   is non-deletable.
   */
  override removePoint(index: number): void {
    const segIdx = this.locateSegmentForIndex(index);
    if (segIdx === -1) {
      return;
    }

    if (!this.getDeletable()) {
      return;
    }

    if (index < 0 || index >= this.getRelativePoints().length) {
      return;
    }

    for (let i = segIdx; i < this.segmentBoundaries.length; i++) {
      this.segmentBoundaries[i] -= 1;
    }

    const segStart = this.segmentStart(segIdx);
    if (this.segmentBoundaries[segIdx] === segStart) {
      this.segmentBoundaries.splice(segIdx, 1);
    }

    // super dispatches `lighter:keypoint-point-deleted` synchronously
    // after splicing `#points`; defer this call until event state is
    // consistent
    super.removePoint(index);

    this.setConnections(this.rebuildConnectionsFromBoundaries());
  }

  /**
   * Inserts a point at position `indexInSegment` within `segmentIdx`. An
   * `indexInSegment` equal to the segment's length appends.
   *
   * @param segmentIdx Zero-based segment index.
   * @param indexInSegment Zero-based position within the segment, in the inclusive range `[0, segmentLength]`.
   * @param relPoint Relative-coordinate position `[x, y]` of the new point.
   * @param variant Optional variant key used to determine render style.
   * @param id Optional point id; one is generated when omitted.
   * @returns The id of the new point.
   * @throws RangeError if `segmentIdx` or `indexInSegment` is out of range.
   */
  insertPointInSegment(
    segmentIdx: number,
    indexInSegment: number,
    relPoint: [number, number],
    variant?: string,
    id?: string
  ): string {
    if (segmentIdx < 0 || segmentIdx >= this.segmentBoundaries.length) {
      throw new RangeError(
        `PolylineOverlay: segmentIdx ${segmentIdx} out of bounds`
      );
    }

    const segStart = this.segmentStart(segmentIdx);
    const segLen = this.segmentBoundaries[segmentIdx] - segStart;
    if (indexInSegment < 0 || indexInSegment > segLen) {
      throw new RangeError(
        `PolylineOverlay: indexInSegment ${indexInSegment} out of bounds [0, ${segLen}]`
      );
    }

    for (let i = segmentIdx; i < this.segmentBoundaries.length; i++) {
      this.segmentBoundaries[i] += 1;
    }

    // synchronously dispatches `lighter:keypoint-point-added`; defer until
    // event state is consistent
    const newId = this.insertRelativePointAt(
      segStart + indexInSegment,
      relPoint,
      variant,
      id
    );

    this.setConnections(this.rebuildConnectionsFromBoundaries());

    return newId;
  }

  /**
   * Appends a point to the end of `segmentIdx`. Equivalent to
   * {@link insertPointInSegment} with `indexInSegment` set to the segment's
   * current length.
   *
   * @param segmentIdx Zero-based segment index.
   * @param relPoint Relative-coordinate position `[x, y]` of the new point.
   * @param variant Optional variant key used to determine render style.
   * @param id Optional point id; one is generated when omitted.
   * @returns The id of the new point.
   * @throws RangeError if `segmentIdx` is out of range.
   */
  appendPointToSegment(
    segmentIdx: number,
    relPoint: [number, number],
    variant?: string,
    id?: string
  ): string {
    return this.insertPointInSegment(
      segmentIdx,
      this.getSegmentLength(segmentIdx),
      relPoint,
      variant,
      id
    );
  }

  /**
   * Removes the point at position `indexInSegment` within `segmentIdx`. If
   * the segment becomes empty, the segment slot is dropped.
   *
   * @param segmentIdx Zero-based segment index. Out-of-range values are
   *  silently ignored.
   * @param indexInSegment Zero-based position within the segment, in the
   *  half-open range `[0, segmentLength)`. Out-of-range values are silently
   *  ignored.
   */
  removePointFromSegment(segmentIdx: number, indexInSegment: number): void {
    if (segmentIdx < 0 || segmentIdx >= this.segmentBoundaries.length) {
      return;
    }

    const segLen = this.getSegmentLength(segmentIdx);
    if (indexInSegment < 0 || indexInSegment >= segLen) {
      return;
    }

    this.removePoint(this.segmentStart(segmentIdx) + indexInSegment);
  }

  /**
   * Appends a new empty segment. A subsequent {@link addPoint} or
   * {@link appendPointToSegment} populates it.
   *
   * @returns The zero-based index of the newly created segment.
   */
  startNewSegment(): number {
    this.segmentBoundaries.push(this.getRelativePoints().length);
    // No connection entry yet — empty segments don't render.
    return this.segmentBoundaries.length - 1;
  }

  /**
   * Splices a new segment at `segmentIdx` containing a single point. Existing
   * segments at or after that index shift up by one. Use this for the
   * "start new line + place first point" gesture, and to undo a removal that
   * dropped a segment slot.
   *
   * @param segmentIdx Zero-based index for the new segment, in the inclusive
   *  range `[0, segmentCount]`. A value equal to `segmentCount` appends a
   *  trailing segment.
   * @param relPoint Relative-coordinate position `[x, y]` of the new point.
   * @param variant Optional variant key used to determine render style.
   * @param id Optional point id; one is generated when omitted.
   * @returns The id of the new point.
   * @throws RangeError if `segmentIdx` is out of range.
   */
  insertPointInNewSegment(
    segmentIdx: number,
    relPoint: [number, number],
    variant?: string,
    id?: string
  ): string {
    if (segmentIdx < 0 || segmentIdx > this.segmentBoundaries.length) {
      throw new RangeError(
        `PolylineOverlay: segmentIdx ${segmentIdx} out of bounds [0, ${this.segmentBoundaries.length}]`
      );
    }

    const segStart = this.segmentStart(segmentIdx);
    this.segmentBoundaries.splice(segmentIdx, 0, segStart);
    return this.insertPointInSegment(segmentIdx, 0, relPoint, variant, id);
  }

  /**
   * Returns the id of the point at `(segmentIdx, indexInSegment)`, or `null`
   * if either coordinate is out of range.
   *
   * @param segmentIdx Zero-based segment index.
   * @param indexInSegment Zero-based position within the segment.
   */
  getPointIdInSegment(
    segmentIdx: number,
    indexInSegment: number
  ): string | null {
    if (segmentIdx < 0 || segmentIdx >= this.segmentBoundaries.length) {
      return null;
    }

    const segLen = this.getSegmentLength(segmentIdx);
    if (indexInSegment < 0 || indexInSegment >= segLen) {
      return null;
    }

    return this.getPointIdAt(this.segmentStart(segmentIdx) + indexInSegment);
  }

  /**
   * Returns the `(segmentIdx, indexInSegment)` coordinates of the point with
   * the given id, or `null` if no such point exists. Inverse of
   * {@link getPointIdInSegment}.
   *
   * @param pointId Id of the point to locate.
   */
  findPointLocationById(
    pointId: string
  ): { segmentIdx: number; indexInSegment: number } | null {
    const total = this.getRelativePoints().length;

    for (let i = 0; i < total; i++) {
      if (this.getPointIdAt(i) === pointId) {
        const segmentIdx = this.locateSegmentForIndex(i);
        return {
          segmentIdx,
          indexInSegment: i - this.segmentStart(segmentIdx),
        };
      }
    }

    return null;
  }

  /**
   * Locates the closest edge to `worldPoint` within `thresholdOverride` (or
   * the default `EDGE_THRESHOLD` adjusted for the current scale).
   *
   * For closed polylines, the closing edge from the last point back to the
   * first is included; its `edgeIdx` is the segment's last point index, and
   * inserting at `indexInSegment = segLen` (i.e. appending) splits it.
   *
   * @param worldPoint Absolute (world-space) point to test against.
   * @param thresholdOverride Maximum distance to consider, in world units.
   *  Defaults to `EDGE_THRESHOLD / scale`.
   * @returns `{ segmentIdx, edgeIdx, projectedRel }` for the closest edge, or
   *  `null` if none is within threshold. `projectedRel` is the click position
   *  projected onto the matched edge in relative coordinates, suitable for
   *  {@link insertPointInSegment}.
   */
  findEdgeAt(
    worldPoint: Point,
    thresholdOverride?: number
  ): {
    segmentIdx: number;
    edgeIdx: number;
    projectedRel: [number, number];
  } | null {
    const scale = this.renderer?.getScale() ?? 1;
    const threshold = thresholdOverride ?? EDGE_THRESHOLD / scale;
    const flatRel = this.getRelativePoints();
    if (flatRel.length === 0) {
      return null;
    }

    let best: {
      segmentIdx: number;
      edgeIdx: number;
      projectedRel: [number, number];
      dist: number;
    } | null = null;

    let prev = 0;
    for (let segIdx = 0; segIdx < this.segmentBoundaries.length; segIdx++) {
      const end = this.segmentBoundaries[segIdx];
      const segPointsRel = flatRel.slice(prev, end);
      const segPointsAbs = segPointsRel.map((rp) =>
        this.relativePointToAbsolute(rp)
      );

      for (let edgeIdx = 0; edgeIdx < segPointsAbs.length - 1; edgeIdx++) {
        const aAbs = segPointsAbs[edgeIdx];
        const bAbs = segPointsAbs[edgeIdx + 1];
        const d = distanceFromLineSegment(worldPoint, aAbs, bAbs);
        if (d <= threshold && (!best || d < best.dist)) {
          const wpRel = this.absolutePointToRelative(worldPoint);
          best = {
            segmentIdx: segIdx,
            edgeIdx,
            projectedRel: projectOntoSegment2d(
              [wpRel[0], wpRel[1]],
              segPointsRel[edgeIdx],
              segPointsRel[edgeIdx + 1]
            ),
            dist: d,
          };
        }
      }

      // Closing edge for closed polylines with >=3 points
      if (this.polylineClosed && segPointsAbs.length > 2) {
        const aAbs = segPointsAbs[segPointsAbs.length - 1];
        const bAbs = segPointsAbs[0];
        const d = distanceFromLineSegment(worldPoint, aAbs, bAbs);
        if (d <= threshold && (!best || d < best.dist)) {
          const wpRel = this.absolutePointToRelative(worldPoint);
          best = {
            segmentIdx: segIdx,
            edgeIdx: segPointsAbs.length - 1,
            projectedRel: projectOntoSegment2d(
              [wpRel[0], wpRel[1]],
              segPointsRel[segPointsRel.length - 1],
              segPointsRel[0]
            ),
            dist: d,
          };
        }
      }

      prev = end;
    }

    return best
      ? {
          segmentIdx: best.segmentIdx,
          edgeIdx: best.edgeIdx,
          projectedRel: best.projectedRel,
        }
      : null;
  }

  /**
   * Locates the head (first) or tail (last) point of any segment closest to
   * `worldPoint`. Used as the fallback for empty-space clicks during editing,
   * so this method intentionally has no distance threshold — when any
   * non-empty segment exists, an endpoint is always returned.
   *
   * @param worldPoint Absolute (world-space) point to measure distance from.
   * @param restrictToSegmentIdx If provided, only the head/tail of that
   *  segment are considered; returns `null` if the segment is missing or
   *  empty.
   * @param preferFar When `true`, picks the farthest candidate instead of
   *  the nearest — used to override the default proximity anchor (e.g.
   *  meta-click extending the opposite end of a segment).
   * @returns `{ segmentIdx, end }` for the matching endpoint, or `null` if
   *  no non-empty segments exist. `end` is `"head"` for the segment's first
   *  point and `"tail"` for its last.
   */
  findNearestEndpoint(
    worldPoint: Point,
    restrictToSegmentIdx?: number,
    preferFar?: boolean
  ): SegmentEndpoint {
    const flatRel = this.getRelativePoints();
    if (flatRel.length === 0) {
      return null;
    }

    let best: {
      segmentIdx: number;
      end: "head" | "tail";
      dist: number;
    } | null = null;

    const isBetter = (dist: number): boolean => {
      if (!best) {
        return true;
      }

      return preferFar ? dist > best.dist : dist < best.dist;
    };

    let prev = 0;
    for (let segIdx = 0; segIdx < this.segmentBoundaries.length; segIdx++) {
      const segEnd = this.segmentBoundaries[segIdx];
      if (segEnd === prev) {
        prev = segEnd;
        continue;
      }

      if (
        restrictToSegmentIdx !== undefined &&
        segIdx !== restrictToSegmentIdx
      ) {
        prev = segEnd;
        continue;
      }

      const headAbs = this.relativePointToAbsolute(flatRel[prev]);
      const dHead = distance(worldPoint.x, worldPoint.y, headAbs.x, headAbs.y);
      if (isBetter(dHead)) {
        best = { segmentIdx: segIdx, end: "head", dist: dHead };
      }

      const tailIdx = segEnd - 1;
      if (tailIdx !== prev) {
        const tailAbs = this.relativePointToAbsolute(flatRel[tailIdx]);
        const dTail = distance(
          worldPoint.x,
          worldPoint.y,
          tailAbs.x,
          tailAbs.y
        );
        if (isBetter(dTail)) {
          best = { segmentIdx: segIdx, end: "tail", dist: dTail };
        }
      }

      prev = segEnd;
    }

    return best ? { segmentIdx: best.segmentIdx, end: best.end } : null;
  }

  private segmentStart(segmentIdx: number): number {
    return segmentIdx === 0 ? 0 : this.segmentBoundaries[segmentIdx - 1];
  }

  private locateSegmentForIndex(globalIndex: number): number {
    for (let i = 0; i < this.segmentBoundaries.length; i++) {
      if (globalIndex < this.segmentBoundaries[i]) {
        return i;
      }
    }

    return -1;
  }

  private rebuildConnectionsFromBoundaries(): number[][] {
    const connections: number[][] = [];
    let prev = 0;

    for (const end of this.segmentBoundaries) {
      if (end > prev) {
        const path: number[] = [];
        for (let i = prev; i < end; i++) {
          path.push(i);
        }
        connections.push(path);
      }
      prev = end;
    }

    return connections;
  }

  /**
   * Restricts the preview line to anchor against a specific segment. Pass
   * `null` to anchor against the globally nearest endpoint instead. Mirrors
   * the active-segment state held by the interactive handler.
   */
  setPreviewAnchorSegmentIdx(segmentIdx: number | null): void {
    if (this.previewAnchorSegmentIdx === segmentIdx) {
      return;
    }

    this.previewAnchorSegmentIdx = segmentIdx;
    this.markDirty();
  }

  /**
   * Flips the preview anchor between the segment's near and far endpoint.
   * Set to `true` while the user holds the meta-key override; the dashed
   * line then telegraphs the same anchor a click would produce.
   */
  setPreviewAnchorFlipped(flipped: boolean): void {
    if (this.previewAnchorFlipped === flipped) {
      return;
    }

    this.previewAnchorFlipped = flipped;
    this.markDirty();
  }

  /**
   * Sets the sticky-anchor point id for the preview line. When set (and the
   * point still exists, and meta-flip is off), the preview anchors against
   * this point instead of the segment's nearest endpoint. Pass `null` to
   * clear and fall back to nearest-endpoint anchoring.
   */
  setPreviewAnchorPointId(pointId: string | null): void {
    if (this.previewAnchorPointId === pointId) {
      return;
    }

    this.previewAnchorPointId = pointId;
    this.markDirty();
  }

  /**
   * Anchors the preview line so the dashed telegraph matches the point that
   * EXTEND will actually produce on click.
   *
   *   - **Sticky set, no meta-flip** — anchor to the sticky point.
   *   - **Sticky set, meta-flip on** — anchor to the opposite endpoint of
   *     the sticky's segment (matches the swap-by-identity logic in
   *     {@link InteractivePolylineHandler}).
   *   - **No sticky (or sticky is stale/no longer an endpoint)** — fall
   *     back to `findNearestEndpoint` against the active segment, with
   *     meta-flip selecting farthest-from-cursor.
   */
  protected override renderPreviewLine(
    renderer: Renderer2D,
    ctx: KeypointRenderContext
  ): void {
    if (!this.previewPoint || ctx.absPoints.length === 0) {
      return;
    }

    // Sticky-aware anchor resolution: when a sticky point id is set and the
    // point is still an endpoint of its segment, anchor to that point — or,
    // when meta-flip is active, to the opposite endpoint of the same
    // segment (matching the meta-swap behavior in
    // InteractivePolylineHandler, which toggles by endpoint identity rather
    // than by cursor distance).
    let entry: ReturnType<typeof this.getPointById> | null = null;

    if (this.previewAnchorPointId) {
      const loc = this.findPointLocationById(this.previewAnchorPointId);
      if (loc) {
        const segLen = this.getSegmentLength(loc.segmentIdx);
        let anchorIndexInSegment: number | null = null;
        if (loc.indexInSegment === 0) {
          anchorIndexInSegment = this.previewAnchorFlipped ? segLen - 1 : 0;
        } else if (loc.indexInSegment === segLen - 1) {
          anchorIndexInSegment = this.previewAnchorFlipped ? 0 : segLen - 1;
        }
        if (anchorIndexInSegment !== null) {
          const anchorId = this.getPointIdInSegment(
            loc.segmentIdx,
            anchorIndexInSegment
          );
          entry = anchorId ? this.getPointById(anchorId) : null;
        }
      }
    }

    if (!entry) {
      const nearest = this.findNearestEndpoint(
        this.previewPoint,
        this.previewAnchorSegmentIdx ?? undefined,
        this.previewAnchorFlipped
      );
      if (!nearest) {
        return;
      }

      const segLen = this.getSegmentLength(nearest.segmentIdx);
      if (segLen === 0) {
        return;
      }

      const indexInSegment = nearest.end === "head" ? 0 : segLen - 1;
      const anchorId = this.getPointIdInSegment(
        nearest.segmentIdx,
        indexInSegment
      );
      if (!anchorId) {
        return;
      }

      entry = this.getPointById(anchorId);
    }

    if (!entry) {
      return;
    }

    const anchorAbs = this.relativePointToAbsolute(entry.position);

    renderer.drawLine(
      anchorAbs,
      this.previewPoint,
      {
        strokeStyle: ctx.strokeColor,
        lineWidth: ctx.lineWidth,
        dashPattern: [6, 4],
        opacity: PREVIEW_LINE_OPACITY,
      },
      this.containerId
    );
  }

  protected override renderFill(
    renderer: Renderer2D,
    ctx: KeypointRenderContext
  ): void {
    if (!this.polylineFilled || !this.polylineClosed) return;

    let prev = 0;
    for (const end of this.segmentBoundaries) {
      const segPoints = ctx.absPoints.slice(prev, end);
      prev = end;
      if (segPoints.length < 3) continue;

      renderer.drawPolygon(
        segPoints,
        {
          fillStyle: ctx.style.fillStyle ?? ctx.strokeColor,
          opacity: ctx.style.opacity ?? DEFAULT_FILL_OPACITY,
        },
        this.containerId
      );
    }
  }
}

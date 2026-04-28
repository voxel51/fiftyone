/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { LABEL_ARCHETYPE_PRIORITY } from "../constants";
import type { Renderer2D } from "../renderer/Renderer2D";
import type { DrawStyle, RawLookerLabel } from "../types";
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

  constructor(options: PolylineOptions) {
    const { flatPoints, connections, segmentBoundaries } =
      flattenPolylinePoints(options.label.points ?? []);

    // Synthesize a Keypoint-compatible label so the parent's render machinery
    // operates on a flat point list. The original nested label is preserved
    // by reassigning `this.label` after super() returns.
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
   * Reconstructs the polyline points in their original nested form.
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

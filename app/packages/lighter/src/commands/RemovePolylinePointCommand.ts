/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Undoable } from "@fiftyone/commands";
import type { PolylineOverlay } from "../overlay/PolylineOverlay";

/**
 * Undoable command for removing a single point from a PolylineOverlay.
 *
 * The constructor captures the point's id, relative position, variant, and
 * whether it was the segment's sole inhabitant — so undo restores both the
 * point and (when needed) the segment slot.
 */
export class RemovePolylinePointCommand implements Undoable {
  readonly id: string;
  readonly description: string;

  private readonly pointId: string;
  private readonly relativePosition: [number, number];
  private readonly variant?: string;
  private readonly wasSoleInSegment: boolean;

  constructor(
    private overlay: PolylineOverlay,
    private segmentIdx: number,
    private indexInSegment: number,
  ) {
    const id = overlay.getPointIdInSegment(segmentIdx, indexInSegment);
    if (id === null) {
      throw new Error(
        `RemovePolylinePointCommand: no point at segment ${segmentIdx} index ${indexInSegment}`,
      );
    }

    const entry = overlay.getPointById(id);
    if (!entry) {
      throw new Error(
        `RemovePolylinePointCommand: missing entry for point ${id}`,
      );
    }

    this.pointId = id;
    this.relativePosition = entry.position;
    this.variant = entry.variant;
    this.wasSoleInSegment = overlay.getSegmentLength(segmentIdx) === 1;

    this.id = `remove-polyline-point-${id}-${Date.now()}`;
    this.description = `Remove polyline point ${id}`;
  }

  execute(): void {
    this.overlay.removePointFromSegment(this.segmentIdx, this.indexInSegment);
  }

  undo(): void {
    if (this.wasSoleInSegment) {
      this.overlay.insertPointInNewSegment(
        this.segmentIdx,
        this.relativePosition,
        this.variant,
        this.pointId,
      );
    } else {
      this.overlay.insertPointInSegment(
        this.segmentIdx,
        this.indexInSegment,
        this.relativePosition,
        this.variant,
        this.pointId,
      );
    }
  }
}

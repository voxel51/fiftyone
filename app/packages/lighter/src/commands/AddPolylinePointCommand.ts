/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Undoable } from "@fiftyone/commands";
import type { PolylineOverlay } from "../overlay/PolylineOverlay";

/**
 * Undoable command for adding a single point to a PolylineOverlay.
 *
 * When `createsNewSegment` is `true`, redo splices a new segment slot at
 * `segmentIdx` before placing the point — this matches the gesture where a
 * user begins a new line with the first click. Undo removes the point; the
 * empty segment slot drops automatically.
 */
export class AddPolylinePointCommand implements Undoable {
  readonly id: string;
  readonly description: string;

  constructor(
    private overlay: PolylineOverlay,
    private segmentIdx: number,
    private indexInSegment: number,
    private pointId: string,
    private relativePosition: [number, number],
    private variant?: string,
    private createsNewSegment: boolean = false
  ) {
    this.id = `add-polyline-point-${pointId}-${Date.now()}`;
    this.description = `Add polyline point ${pointId}`;
  }

  execute(): void {
    if (this.createsNewSegment) {
      this.overlay.insertPointInNewSegment(
        this.segmentIdx,
        this.relativePosition,
        this.variant,
        this.pointId
      );
    } else {
      this.overlay.insertPointInSegment(
        this.segmentIdx,
        this.indexInSegment,
        this.relativePosition,
        this.variant,
        this.pointId
      );
    }
  }

  undo(): void {
    this.overlay.removePointFromSegment(this.segmentIdx, this.indexInSegment);
  }
}

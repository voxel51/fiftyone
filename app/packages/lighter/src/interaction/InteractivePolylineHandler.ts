/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { CommandContextManager } from "@fiftyone/commands";
import { ClickEventModifiers, getClickModifiers } from "@fiftyone/utilities";
import { AddPolylinePointCommand } from "../commands/AddPolylinePointCommand";
import { MoveKeypointPointCommand } from "../commands/MoveKeypointPointCommand";
import { RemovePolylinePointCommand } from "../commands/RemovePolylinePointCommand";
import type { PolylineOverlay } from "../overlay/PolylineOverlay";
import type { Point } from "../types";
import type { InteractionHandler } from "./InteractionManager";
import {
  KeypointPointHitAction,
  type KeypointPointHitContext,
} from "./InteractiveKeypointHandler";
import { KeypointOverlay } from "../overlay/KeypointOverlay";

const INTERACTIVE_POLYLINE_HANDLER_ID = "interactive-polyline-handler";

/**
 * Action returned by the edge-hit resolver. `undefined` falls through to the
 * default ({@link PolylineEdgeHitAction.INSERT}).
 */
export enum PolylineEdgeHitAction {
  INSERT = "insert",
  IGNORE = "ignore",
}

/**
 * Action returned by the empty-space-hit resolver. `undefined` falls through
 * to the default ({@link PolylineEmptyHitAction.EXTEND}).
 */
export enum PolylineEmptyHitAction {
  EXTEND = "extend",
  NEW_SEGMENT = "new-segment",
  IGNORE = "ignore",
}

/**
 * Context passed to the edge-hit resolver when a click lands on an existing
 * polyline edge.
 */
export type PolylineEdgeHitContext = {
  segmentIdx: number;
  edgeIdx: number;
  /** Click projected onto the matched edge, in relative coordinates. */
  projectedRel: Point;
  modifiers: ClickEventModifiers;
};

/**
 * Context passed to the empty-space-hit resolver when a click lands away
 * from any point or edge.
 */
export type PolylineEmptyHitContext = {
  worldPoint: Point;
  relativePoint: Point;
  modifiers: ClickEventModifiers;
};

/**
 * Editing handler for an existing {@link PolylineOverlay}.
 *
 * Captures all clicks while active and dispatches them by hit kind:
 *
 * - **Hit on an existing point** — drag (default), or whatever the
 *   `resolvePointHit` resolver returns (e.g. `DELETE` on Alt-click).
 * - **Hit on an edge** — insert a new point at the projected position
 *   (default), or whatever `resolveEdgeHit` returns. After insert, the new
 *   point enters drag immediately so the user can fine-tune its position.
 * - **Empty-space click** — extend the nearest segment endpoint (default),
 *   `NEW_SEGMENT` to start a fresh segment, or whatever `resolveEmptyHit`
 *   returns.
 *
 * Resolvers are optional; sensible defaults cover the common case. Returning
 * `undefined` from a resolver also falls through to the default. Each
 * mutation pushes an undoable command onto the active context;
 * {@link pruneCommands} removes everything pushed by this handler instance,
 * for use when an editing session is cancelled.
 */
export class InteractivePolylineHandler implements InteractionHandler {
  readonly id = INTERACTIVE_POLYLINE_HANDLER_ID;
  readonly cursor = "crosshair";

  private readonly pushedCommandIds = new Set<string>();

  private dragPointId: string | null = null;
  private dragStartRelative: [number, number] | null = null;

  /**
   * Segment that subsequent empty-space EXTEND clicks should append to. Set
   * whenever a click lands on (or creates) a segment; cleared if that segment
   * is later spliced away by a deletion. Mirrored to the overlay so the
   * preview line anchors against the same segment.
   */
  private activeSegmentIdx: number | null = null;

  /**
   * Saved `isDeletable` value from before the handler installed. Polyline
   * overlays are typically constructed with `deletable: false` so deletes are
   * blocked in non-edit contexts; an active editing session needs point
   * removal allowed.
   */
  private readonly priorIsDeletable: boolean;

  private setActiveSegmentIdx(segmentIdx: number | null): void {
    this.activeSegmentIdx = segmentIdx;
    this.overlay.setPreviewAnchorSegmentIdx(segmentIdx);
  }

  constructor(
    public readonly overlay: PolylineOverlay,
    private readonly resolvePointHit?: (
      ctx: KeypointPointHitContext
    ) => KeypointPointHitAction | undefined,
    private readonly resolveEdgeHit?: (
      ctx: PolylineEdgeHitContext
    ) => PolylineEdgeHitAction | undefined,
    private readonly resolveEmptyHit?: (
      ctx: PolylineEmptyHitContext
    ) => PolylineEmptyHitAction | undefined
  ) {
    this.priorIsDeletable = overlay.getDeletable();
    overlay.setDeletable(true);
  }

  containsPoint(): boolean {
    // Capture all clicks while active
    return true;
  }

  getOverlay(): PolylineOverlay {
    return this.overlay;
  }

  isMoving(): boolean {
    return this.dragPointId !== null;
  }

  isDragging(): boolean {
    return this.dragPointId !== null;
  }

  markDirty(): void {
    this.overlay.markDirty();
  }

  onPointerDown(
    _point: Point,
    worldPoint: Point,
    event: PointerEvent
  ): boolean {
    const modifiers = getClickModifiers(event);
    const rp = this.overlay.absolutePointToRelative(worldPoint);
    const relativePoint: Point = { x: rp[0], y: rp[1] };

    // 1) Existing point?
    const hitId = this.overlay.findPointIdAt(worldPoint);
    if (hitId) {
      const loc = this.overlay.findPointLocationById(hitId);
      if (loc) {
        this.setActiveSegmentIdx(loc.segmentIdx);
      }

      const action = this.resolvePointHit?.({
        pointId: hitId,
        relativePoint,
        modifiers,
      });

      if (action === KeypointPointHitAction.DELETE) {
        this.deletePointById(hitId);
      } else {
        this.startDrag(hitId);
      }

      return true;
    }

    // 2) Edge?
    const edgeHit = this.overlay.findEdgeAt(worldPoint);
    if (edgeHit) {
      this.setActiveSegmentIdx(edgeHit.segmentIdx);

      const action =
        this.resolveEdgeHit?.({
          segmentIdx: edgeHit.segmentIdx,
          edgeIdx: edgeHit.edgeIdx,
          projectedRel: {
            x: edgeHit.projectedRel[0],
            y: edgeHit.projectedRel[1],
          },
          modifiers,
        }) ?? PolylineEdgeHitAction.INSERT;

      if (action === PolylineEdgeHitAction.IGNORE) {
        return true;
      }

      const newId = this.insertOnEdge(edgeHit);
      this.startDrag(newId);
      return true;
    }

    // 3) Empty space.
    const action =
      this.resolveEmptyHit?.({
        worldPoint,
        relativePoint,
        modifiers,
      }) ?? PolylineEmptyHitAction.EXTEND;

    if (action === PolylineEmptyHitAction.IGNORE) {
      return true;
    }

    if (action === PolylineEmptyHitAction.NEW_SEGMENT) {
      this.startNewSegmentWithPoint(rp);
      return true;
    }

    this.extendNearestEndpoint(worldPoint, rp);
    return true;
  }

  onMove(_point: Point, worldPoint: Point, _event: PointerEvent): boolean {
    if (this.dragPointId !== null) {
      this.overlay.movePointById(
        this.dragPointId,
        this.overlay.absolutePointToRelative(worldPoint)
      );

      return true;
    }

    // Hover preview — telegraphs where the next click will place a point.
    this.overlay.setPreviewPoint(worldPoint);

    return true;
  }

  onPointerUp(_point: Point, _event: PointerEvent): boolean {
    if (this.dragPointId === null) {
      return true;
    }

    const id = this.dragPointId;
    const from = this.dragStartRelative;
    const entry = this.overlay.getPointById(id);

    this.dragPointId = null;
    this.dragStartRelative = null;

    if (!entry || !from) {
      return true;
    }

    const to = entry.position;
    if (from[0] === to[0] && from[1] === to[1]) {
      return true;
    }

    const cmd = new MoveKeypointPointCommand(
      this.overlay as unknown as KeypointOverlay,
      id,
      from,
      to
    );
    CommandContextManager.instance().getActiveContext().pushUndoable(cmd);
    this.pushedCommandIds.add(cmd.id);

    return true;
  }

  cleanup(): void {
    this.overlay.setPreviewPoint(null);
    this.overlay.setPreviewAnchorSegmentIdx(null);
    this.overlay.setDeletable(this.priorIsDeletable);
  }

  /**
   * Pre-activates the segment under `worldPoint` (point hit, then edge hit,
   * then nearest endpoint). Used at install time to inherit the segment
   * implied by the click that triggered selection — without this, the user
   * would have to click again before EXTEND constrains to that segment.
   *
   * Pass `null` to clear activation.
   */
  activateSegmentAtWorldPoint(worldPoint: Point | null): void {
    if (!worldPoint) {
      this.setActiveSegmentIdx(null);
      return;
    }

    const hitId = this.overlay.findPointIdAt(worldPoint);
    if (hitId) {
      const loc = this.overlay.findPointLocationById(hitId);
      if (loc) {
        this.setActiveSegmentIdx(loc.segmentIdx);
        return;
      }
    }

    const edgeHit = this.overlay.findEdgeAt(worldPoint);
    if (edgeHit) {
      this.setActiveSegmentIdx(edgeHit.segmentIdx);
      return;
    }

    const nearest = this.overlay.findNearestEndpoint(worldPoint);
    if (nearest) {
      this.setActiveSegmentIdx(nearest.segmentIdx);
    }
  }

  /**
   * Removes all undo/redo entries that this handler pushed during its
   * lifetime from the active command context.
   */
  pruneCommands(): void {
    if (this.pushedCommandIds.size === 0) return;

    CommandContextManager.instance()
      .getActiveContext()
      .pruneUndoables((u) => this.pushedCommandIds.has(u.id));

    this.pushedCommandIds.clear();
  }

  private startDrag(pointId: string): void {
    const entry = this.overlay.getPointById(pointId);
    if (!entry) {
      return;
    }

    this.dragPointId = pointId;
    this.dragStartRelative = [entry.position[0], entry.position[1]];
  }

  private deletePointById(pointId: string): void {
    const loc = this.overlay.findPointLocationById(pointId);
    if (!loc) {
      return;
    }

    const segCountBefore = this.overlay.getSegmentCount();
    const cmd = new RemovePolylinePointCommand(
      this.overlay,
      loc.segmentIdx,
      loc.indexInSegment
    );
    cmd.execute();
    CommandContextManager.instance().getActiveContext().pushUndoable(cmd);
    this.pushedCommandIds.add(cmd.id);

    // If the segment was emptied, indices for following segments shift down.
    if (this.overlay.getSegmentCount() < segCountBefore) {
      if (this.activeSegmentIdx === loc.segmentIdx) {
        this.setActiveSegmentIdx(null);
      } else if (
        this.activeSegmentIdx !== null &&
        this.activeSegmentIdx > loc.segmentIdx
      ) {
        this.setActiveSegmentIdx(this.activeSegmentIdx - 1);
      }
    }
  }

  private insertOnEdge(edgeHit: {
    segmentIdx: number;
    edgeIdx: number;
    projectedRel: [number, number];
  }): string {
    // Inserting after edgeIdx means new point sits at indexInSegment = edgeIdx + 1.
    // For closing edges (edgeIdx === segLen - 1) that resolves to segLen, which
    // appends — closure auto-reforms.
    const indexInSegment = edgeHit.edgeIdx + 1;
    const newId = this.overlay.insertPointInSegment(
      edgeHit.segmentIdx,
      indexInSegment,
      edgeHit.projectedRel
    );

    const cmd = new AddPolylinePointCommand(
      this.overlay,
      edgeHit.segmentIdx,
      indexInSegment,
      newId,
      edgeHit.projectedRel
    );
    CommandContextManager.instance().getActiveContext().pushUndoable(cmd);
    this.pushedCommandIds.add(cmd.id);

    return newId;
  }

  private startNewSegmentWithPoint(rp: [number, number]): string {
    const newSegIdx = this.overlay.startNewSegment();
    const newId = this.overlay.appendPointToSegment(newSegIdx, rp);

    const cmd = new AddPolylinePointCommand(
      this.overlay,
      newSegIdx,
      0,
      newId,
      rp,
      undefined,
      true
    );
    CommandContextManager.instance().getActiveContext().pushUndoable(cmd);
    this.pushedCommandIds.add(cmd.id);

    this.setActiveSegmentIdx(newSegIdx);

    return newId;
  }

  private extendNearestEndpoint(
    worldPoint: Point,
    rp: [number, number]
  ): string {
    // Restrict to the active segment if the user has clicked one; otherwise
    // fall back to the global nearest endpoint.
    const target = this.overlay.findNearestEndpoint(
      worldPoint,
      this.activeSegmentIdx ?? undefined
    );
    // No segments yet — extend gesture seeds the first segment.
    if (!target) {
      return this.startNewSegmentWithPoint(rp);
    }

    // First extend with no prior activation — adopt the chosen segment so
    // subsequent extends keep targeting it.
    this.setActiveSegmentIdx(target.segmentIdx);

    const segLen = this.overlay.getSegmentLength(target.segmentIdx);
    const indexInSegment = target.end === "head" ? 0 : segLen;

    const newId = this.overlay.insertPointInSegment(
      target.segmentIdx,
      indexInSegment,
      rp
    );
    const cmd = new AddPolylinePointCommand(
      this.overlay,
      target.segmentIdx,
      indexInSegment,
      newId,
      rp
    );
    CommandContextManager.instance().getActiveContext().pushUndoable(cmd);
    this.pushedCommandIds.add(cmd.id);

    return newId;
  }
}

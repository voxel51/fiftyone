/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { CommandContextManager } from "@fiftyone/commands";
import { MoveKeypointPointCommand } from "../commands/MoveKeypointPointCommand";
import { KeypointOverlay } from "../overlay/KeypointOverlay";
import type { InteractionHandler, OverlayEvent } from "./InteractionManager";

const GUIDED_KEYPOINT_HANDLER_ID = "guided-keypoint-handler";

/**
 * Callbacks that connect the handler to the guided-placement state its owner
 * (the keypoint annotation mode) holds: which skeleton node the next click
 * places, and what to do once it lands.
 */
export type GuidedKeypointCallbacks = {
  /**
   * Index of the skeleton node the next click places, or `null` when every
   * node is resolved (placed or skipped) and clicks should fall through.
   */
  getTargetIndex: () => number | null;
  /** Notification that the node at `index` was just placed. */
  onPlaced: (index: number) => void;
  /**
   * Display name for a skeleton node, drawn as a cursor tag while aiming so
   * the user knows which node the next click places. Optional — skeletons
   * without node labels tag nothing.
   */
  getNodeLabel?: (index: number) => string | null;
};

/**
 * Interactive handler for guided keypoint placement against a skeleton field.
 *
 * The overlay is created with one `[NaN, NaN]` hole per skeleton node, so
 * placing a node is a *move* of an existing point (hole → position), never an
 * add or remove — a node's index is its identity, and the point list's length
 * never changes. Each placement funnels through the same
 * `keypoint-point-moved` event and `MoveKeypointPointCommand` undo that
 * dragging an existing point uses, so persistence and undo need no extra
 * wiring. Free-form fields (no skeleton) use {@link InteractiveKeypointHandler}
 * instead.
 */
export class GuidedKeypointHandler implements InteractionHandler {
  readonly id = GUIDED_KEYPOINT_HANDLER_ID;
  readonly cursor = "crosshair";

  private readonly pushedCommandIds = new Set<string>();

  constructor(
    public readonly overlay: KeypointOverlay,
    private readonly callbacks: GuidedKeypointCallbacks,
  ) {}

  containsPoint(): boolean {
    // Capture all clicks while guided placement is active
    return true;
  }

  getOverlay(): KeypointOverlay {
    return this.overlay;
  }

  markDirty(): void {
    this.overlay.markDirty();
  }

  isMoving(): boolean {
    return false;
  }

  isDragging(): boolean {
    return false;
  }

  onPointerDown({ worldPoint }: OverlayEvent): boolean {
    const rp = this.overlay.absolutePointToRelative(worldPoint);

    // Reject placements outside the sample: relative coordinates run [0, 1]
    // across the canonical media, and anything outside falls on letterboxing
    // (cf. InteractiveKeypointHandler).
    if (rp[0] < 0 || rp[0] > 1 || rp[1] < 0 || rp[1] > 1) {
      return false;
    }

    const index = this.callbacks.getTargetIndex();
    if (index === null) {
      return false;
    }

    const pointId = this.overlay.getPointIdAt(index);
    if (!pointId) {
      return false;
    }

    const from = this.overlay.getPointById(pointId)?.position;
    if (!from) {
      return false;
    }

    // `lighter:keypoint-point-moved` drives the engine commit — every
    // placement commits (the engine upserts the label on the first one)
    this.overlay.movePointById(pointId, rp, true);

    const command = new MoveKeypointPointCommand(
      this.overlay,
      pointId,
      from,
      rp,
      true,
    );
    CommandContextManager.instance().getActiveContext().pushUndoable(command);
    this.pushedCommandIds.add(command.id);

    this.callbacks.onPlaced(index);
    return true;
  }

  onMove({ worldPoint }: OverlayEvent): boolean {
    // Carry the target node so the preview draws the edges this placement
    // will actually create (from placed skeleton neighbors), not a line from
    // whatever point happened to land last — plus the node's name as a
    // cursor tag.
    const target = this.callbacks.getTargetIndex();
    this.overlay.setPreviewPoint(
      worldPoint,
      target,
      target === null ? null : (this.callbacks.getNodeLabel?.(target) ?? null),
    );
    return true;
  }

  onPointerUp(): boolean {
    // No-op — nodes are placed on pointer down, not release
    return true;
  }

  cleanup(): void {
    this.overlay.setPreviewPoint(null);
  }

  /**
   * Removes all undo/redo entries this handler pushed from the active command
   * context (cf. {@link InteractiveKeypointHandler.pruneCommands}).
   */
  pruneCommands(): void {
    if (this.pushedCommandIds.size === 0) {
      return;
    }

    CommandContextManager.instance()
      .getActiveContext()
      .pruneUndoables((u) => this.pushedCommandIds.has(u.id));

    this.pushedCommandIds.clear();
  }
}

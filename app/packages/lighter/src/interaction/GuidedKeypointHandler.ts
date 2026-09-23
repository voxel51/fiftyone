/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

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
   * Shift+click: skip the node at `index` instead of placing it. The node
   * stays a hole and the owner advances the target. Optional — without it,
   * Shift+click places like any click.
   */
  onSkip?: (index: number) => void;
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
 * never changes. Each placement emits `keypoint-point-moved`, which the
 * annotation engine commits; the engine owns undo, so the handler records no
 * command of its own (one would double-record every placement on the shared
 * stack — see `Scene2D.setExternalUndoAuthority`). Free-form fields (no
 * skeleton) use {@link InteractiveKeypointHandler} instead.
 */
export class GuidedKeypointHandler implements InteractionHandler {
  readonly id = GUIDED_KEYPOINT_HANDLER_ID;
  readonly cursor = "crosshair";

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

  onPointerDown({ worldPoint, event }: OverlayEvent): boolean {
    const index = this.callbacks.getTargetIndex();
    if (index === null) {
      return false;
    }

    // Shift+click skips the target wherever it lands: a skip has no position.
    // Shift is the camera-pan modifier elsewhere; while placement is armed it
    // is a placement modifier instead, as in polyline mode (new segment).
    if (event.shiftKey && this.callbacks.onSkip) {
      this.callbacks.onSkip(index);
      return true;
    }

    const rp = this.overlay.absolutePointToRelative(worldPoint);

    // Reject placements outside the sample: relative coordinates run [0, 1]
    // across the canonical media, and anything outside falls on letterboxing
    // (cf. InteractiveKeypointHandler).
    if (rp[0] < 0 || rp[0] > 1 || rp[1] < 0 || rp[1] > 1) {
      return false;
    }

    const pointId = this.overlay.getPointIdAt(index);
    if (!pointId) {
      return false;
    }

    // `lighter:keypoint-point-moved` drives the engine commit — every
    // placement commits (the engine upserts the label on the first one) and
    // is one engine-recorded undo step
    this.overlay.movePointById(pointId, rp, true);

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
}

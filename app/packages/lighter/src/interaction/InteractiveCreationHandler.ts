/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Point } from "../types";
import type { InteractionHandler } from "./InteractionManager";

/**
 * Configuration for an {@link InteractiveCreationHandler}.
 */
export interface InteractiveCreationHandlerOptions {
  /** Stable id for the handler. */
  id: string;
  /** Cursor while the handler is active. Defaults to `"crosshair"`. */
  cursor?: string;
  /**
   * Invoked on each pointer-down. Typically creates a new overlay seeded
   * at `worldPoint`. Caller is responsible for swapping in a per-overlay
   * handler once creation completes (e.g. via a selection-driven effect).
   */
  onCreate: (worldPoint: Point) => void;
}

/**
 * Interactive handler for "creation modes" — installed via
 * `Scene2D.enterInteractiveMode` when the user has activated a mode (e.g.
 * via toolbar) to create a new overlay but hasn't placed one yet.
 *
 * While installed:
 * - All clicks are captured (no overlay selection runs underneath).
 * - Hover/cursor handling on underlying overlays is suppressed by the
 *   manager (see `InteractionManager.handlePointerMove` interactive-mode
 *   short-circuit), and the configured cursor is shown.
 * - The first pointer-down invokes `onCreate(worldPoint)`.
 *
 * Generic across label types: callers configure `onCreate` to construct
 * whatever overlay the active mode produces (polyline, keypoint, etc.).
 */
export class InteractiveCreationHandler implements InteractionHandler {
  readonly id: string;
  readonly cursor: string;
  private readonly onCreate: (worldPoint: Point) => void;

  constructor(options: InteractiveCreationHandlerOptions) {
    this.id = options.id;
    this.cursor = options.cursor ?? "crosshair";
    this.onCreate = options.onCreate;
  }

  containsPoint(): boolean {
    return true;
  }

  getCursor(): string {
    return this.cursor;
  }

  onPointerDown(_point: Point, worldPoint: Point): boolean {
    this.onCreate(worldPoint);
    return true;
  }

  markDirty() {}
}

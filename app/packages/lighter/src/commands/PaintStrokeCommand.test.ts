/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it, vi } from "vitest";
import type { DetectionOverlay } from "../overlay/DetectionOverlay";
import type { MaskSnapshot } from "../overlay/MaskCanvas";
import type { Rect } from "../types";
import { PaintStrokeCommand } from "./PaintStrokeCommand";

const makeSnapshot = (tag: string): MaskSnapshot =>
  ({ tag, width: 4, height: 4, imageData: {} } as unknown as MaskSnapshot);

const makeBounds = (tag: number): Rect => ({
  x: tag,
  y: tag,
  width: 10,
  height: 10,
});

const makeOverlay = () => {
  const restoreMaskSnapshot = vi.fn();
  return {
    overlay: { restoreMaskSnapshot } as unknown as DetectionOverlay,
    restoreMaskSnapshot,
  };
};

describe("PaintStrokeCommand", () => {
  it("execute restores the after-snapshot and after-bounds on the overlay", () => {
    const { overlay, restoreMaskSnapshot } = makeOverlay();
    const beforeSnapshot = makeSnapshot("before");
    const beforeBounds = makeBounds(1);
    const afterSnapshot = makeSnapshot("after");
    const afterBounds = makeBounds(2);

    const command = new PaintStrokeCommand(
      overlay,
      "overlay-id",
      beforeSnapshot,
      beforeBounds,
      afterSnapshot,
      afterBounds
    );

    command.execute();

    expect(restoreMaskSnapshot).toHaveBeenCalledTimes(1);
    expect(restoreMaskSnapshot).toHaveBeenCalledWith(afterSnapshot, afterBounds);
  });

  it("undo restores the before-snapshot and before-bounds on the overlay", () => {
    const { overlay, restoreMaskSnapshot } = makeOverlay();
    const beforeSnapshot = makeSnapshot("before");
    const beforeBounds = makeBounds(1);
    const afterSnapshot = makeSnapshot("after");
    const afterBounds = makeBounds(2);

    const command = new PaintStrokeCommand(
      overlay,
      "overlay-id",
      beforeSnapshot,
      beforeBounds,
      afterSnapshot,
      afterBounds
    );

    command.undo();

    expect(restoreMaskSnapshot).toHaveBeenCalledTimes(1);
    expect(restoreMaskSnapshot).toHaveBeenCalledWith(
      beforeSnapshot,
      beforeBounds
    );
  });

  it("execute → undo → execute round-trips through after/before/after", () => {
    const { overlay, restoreMaskSnapshot } = makeOverlay();
    const beforeSnapshot = makeSnapshot("before");
    const beforeBounds = makeBounds(1);
    const afterSnapshot = makeSnapshot("after");
    const afterBounds = makeBounds(2);

    const command = new PaintStrokeCommand(
      overlay,
      "overlay-id",
      beforeSnapshot,
      beforeBounds,
      afterSnapshot,
      afterBounds
    );

    command.execute();
    command.undo();
    command.execute();

    const calls = restoreMaskSnapshot.mock.calls;
    expect(calls).toHaveLength(3);
    expect(calls[0]).toEqual([afterSnapshot, afterBounds]);
    expect(calls[1]).toEqual([beforeSnapshot, beforeBounds]);
    expect(calls[2]).toEqual([afterSnapshot, afterBounds]);
  });

  it("passes through undefined snapshot/bounds (representing an empty mask)", () => {
    const { overlay, restoreMaskSnapshot } = makeOverlay();

    const command = new PaintStrokeCommand(
      overlay,
      "overlay-id",
      undefined,
      undefined,
      makeSnapshot("after"),
      makeBounds(2)
    );

    command.undo();

    expect(restoreMaskSnapshot).toHaveBeenCalledWith(undefined, undefined);
  });

  it("constructs an id prefixed with paint- and incorporating the overlay id", () => {
    const { overlay } = makeOverlay();
    const command = new PaintStrokeCommand(
      overlay,
      "my-overlay",
      makeSnapshot("before"),
      makeBounds(1),
      makeSnapshot("after"),
      makeBounds(2)
    );
    expect(command.id).toMatch(/^paint-my-overlay-\d+$/);
  });
});

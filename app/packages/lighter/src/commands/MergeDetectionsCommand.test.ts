/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it, vi } from "vitest";
import { MergeDetectionsCommand } from "./MergeDetectionsCommand";
import type { DetectionOverlay } from "../overlay/DetectionOverlay";
import type { MaskSnapshot, PaintStrokeData } from "../overlay/MaskCanvas";
import type { Rect } from "../types";

const makeSnapshot = (tag: string): MaskSnapshot =>
  ({ tag, width: 4, height: 4, imageData: {} }) as unknown as MaskSnapshot;

const makeBounds = (tag: number): Rect => ({
  x: tag,
  y: tag,
  width: 10,
  height: 10,
});

const makePaintData = (): PaintStrokeData => ({
  beforeSnapshot: makeSnapshot("before"),
  beforeBounds: makeBounds(1),
  afterSnapshot: makeSnapshot("after"),
  afterBounds: makeBounds(2),
});

const makeOverlay = () => {
  const restoreMaskSnapshot = vi.fn();
  return {
    overlay: { restoreMaskSnapshot } as unknown as DetectionOverlay,
    restoreMaskSnapshot,
  };
};

describe("MergeDetectionsCommand", () => {
  it("execute restores the after-snapshot and calls deleteSource", async () => {
    const { overlay, restoreMaskSnapshot } = makeOverlay();
    const paintData = makePaintData();
    const deleteSource = vi.fn().mockResolvedValue(undefined);
    const restoreSource = vi.fn();

    const command = new MergeDetectionsCommand(
      overlay,
      paintData,
      { deleteSource, restoreSource },
      "target-id",
      "source-id",
    );

    await command.execute();

    expect(restoreMaskSnapshot).toHaveBeenCalledTimes(1);
    expect(restoreMaskSnapshot).toHaveBeenCalledWith(
      paintData.afterSnapshot,
      paintData.afterBounds,
    );
    expect(deleteSource).toHaveBeenCalledTimes(1);
    expect(restoreSource).not.toHaveBeenCalled();
  });

  it("undo restores the before-snapshot and calls restoreSource", async () => {
    const { overlay, restoreMaskSnapshot } = makeOverlay();
    const paintData = makePaintData();
    const deleteSource = vi.fn().mockResolvedValue(undefined);
    const restoreSource = vi.fn();

    const command = new MergeDetectionsCommand(
      overlay,
      paintData,
      { deleteSource, restoreSource },
      "target-id",
      "source-id",
    );

    await command.undo();

    expect(restoreMaskSnapshot).toHaveBeenCalledTimes(1);
    expect(restoreMaskSnapshot).toHaveBeenCalledWith(
      paintData.beforeSnapshot,
      paintData.beforeBounds,
    );
    expect(restoreSource).toHaveBeenCalledTimes(1);
    expect(deleteSource).not.toHaveBeenCalled();
  });

  it("execute → undo → execute round-trips state through the snapshots", async () => {
    const { overlay, restoreMaskSnapshot } = makeOverlay();
    const paintData = makePaintData();
    const deleteSource = vi.fn().mockResolvedValue(undefined);
    const restoreSource = vi.fn();

    const command = new MergeDetectionsCommand(
      overlay,
      paintData,
      { deleteSource, restoreSource },
      "target",
      "source",
    );

    await command.execute();
    await command.undo();
    await command.execute();

    const calls = restoreMaskSnapshot.mock.calls;
    expect(calls).toHaveLength(3);
    expect(calls[0]).toEqual([paintData.afterSnapshot, paintData.afterBounds]);
    expect(calls[1]).toEqual([
      paintData.beforeSnapshot,
      paintData.beforeBounds,
    ]);
    expect(calls[2]).toEqual([paintData.afterSnapshot, paintData.afterBounds]);
    expect(deleteSource).toHaveBeenCalledTimes(2);
    expect(restoreSource).toHaveBeenCalledTimes(1);
  });

  it("constructs a unique id incorporating both overlay ids", () => {
    const { overlay } = makeOverlay();
    const command = new MergeDetectionsCommand(
      overlay,
      makePaintData(),
      { deleteSource: vi.fn(), restoreSource: vi.fn() },
      "tgt",
      "src",
    );
    expect(command.id).toMatch(/^merge-tgt-src-\d+$/);
  });
});

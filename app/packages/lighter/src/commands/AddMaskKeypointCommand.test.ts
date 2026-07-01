/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it, vi } from "vitest";
import type { DetectionOverlay } from "../overlay/DetectionOverlay";
import type { Point } from "../types";
import { AddMaskKeypointCommand } from "./AddMaskKeypointCommand";

const makePoint = (x = 1, y = 2): Point => ({ x, y });

const makeOverlay = () => {
  const addMaskKeypoint = vi.fn();
  const removeMaskKeypointById = vi.fn();
  return {
    overlay: {
      addMaskKeypoint,
      removeMaskKeypointById,
    } as unknown as DetectionOverlay,
    addMaskKeypoint,
    removeMaskKeypointById,
  };
};

describe("AddMaskKeypointCommand", () => {
  it("execute adds the keypoint at the recorded position with the stored id", () => {
    const { overlay, addMaskKeypoint } = makeOverlay();
    const point = makePoint(10, 20);

    const command = new AddMaskKeypointCommand(overlay, "kp-1", point);
    command.execute();

    expect(addMaskKeypoint).toHaveBeenCalledTimes(1);
    expect(addMaskKeypoint).toHaveBeenCalledWith(point, {
      id: "kp-1",
      variant: undefined,
    });
  });

  it("execute forwards a custom variant when provided", () => {
    const { overlay, addMaskKeypoint } = makeOverlay();
    const point = makePoint();

    const command = new AddMaskKeypointCommand(
      overlay,
      "kp-2",
      point,
      "negative",
    );
    command.execute();

    expect(addMaskKeypoint).toHaveBeenCalledWith(point, {
      id: "kp-2",
      variant: "negative",
    });
  });

  it("undo removes the keypoint by id", () => {
    const { overlay, removeMaskKeypointById } = makeOverlay();

    const command = new AddMaskKeypointCommand(overlay, "kp-3", makePoint());
    command.undo();

    expect(removeMaskKeypointById).toHaveBeenCalledTimes(1);
    expect(removeMaskKeypointById).toHaveBeenCalledWith("kp-3");
  });

  it("redo (execute after undo) re-adds the same id at the same position", () => {
    const { overlay, addMaskKeypoint, removeMaskKeypointById } = makeOverlay();
    const point = makePoint(5, 7);

    const command = new AddMaskKeypointCommand(overlay, "kp-4", point);
    command.execute();
    command.undo();
    command.execute();

    expect(addMaskKeypoint).toHaveBeenCalledTimes(2);
    expect(addMaskKeypoint.mock.calls[0]).toEqual([
      point,
      { id: "kp-4", variant: undefined },
    ]);
    expect(addMaskKeypoint.mock.calls[1]).toEqual([
      point,
      { id: "kp-4", variant: undefined },
    ]);
    expect(removeMaskKeypointById).toHaveBeenCalledTimes(1);
  });

  it("constructs an id prefixed with add-mask-keypoint- and a description", () => {
    const { overlay } = makeOverlay();
    const command = new AddMaskKeypointCommand(overlay, "kp-x", makePoint());

    expect(command.id).toMatch(/^add-mask-keypoint-kp-x-\d+$/);
    expect(command.description).toBe("Add mask keypoint kp-x");
  });
});

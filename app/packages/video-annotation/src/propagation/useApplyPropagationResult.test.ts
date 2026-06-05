/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ stream: null as unknown }));

vi.mock("../streams/frameLabelsStream", () => ({
  useFrameLabelsStream: () => h.stream,
}));

import {
  useApplyPropagatedDetection,
  useApplyPropagationResult,
} from "./useApplyPropagationResult";

const FPS = 10;

/** Fake stream whose `getValue(time)` maps time→frame (1-based, `(f-1)/fps`). */
function makeStream(frames = new Map<number, unknown[]>()) {
  return {
    fps: FPS,
    getValue: (time: number) => {
      const frame = Math.round(time * FPS) + 1;
      return frames.has(frame) ? { detections: frames.get(frame)! } : null;
    },
    updateLabel: vi.fn(),
  };
}

beforeEach(() => {
  h.stream = null;
});

describe("useApplyPropagatedDetection", () => {
  it("reuses the existing detection's _id when one is present for the instance (replace, not append)", () => {
    const stream = makeStream(
      new Map([[3, [{ _id: "existing-3", instance: { _id: "inst-1" } }]]])
    );
    h.stream = stream;
    const { result } = renderHook(() => useApplyPropagatedDetection());

    const detection = {
      _id: "minted",
      instance: { _id: "inst-1" },
      bounding_box: [0, 0, 1, 1],
    };
    result.current(3, detection as never);

    expect(stream.updateLabel).toHaveBeenCalledWith(3, {
      ...detection,
      _id: "existing-3",
    });
  });

  it("keeps the minted id for a genuine gap in the track (append)", () => {
    const stream = makeStream(
      new Map([[3, [{ _id: "other", instance: { _id: "other-inst" } }]]])
    );
    h.stream = stream;
    const { result } = renderHook(() => useApplyPropagatedDetection());

    const detection = {
      _id: "minted",
      instance: { _id: "inst-1" },
      bounding_box: [0, 0, 1, 1],
    };
    result.current(3, detection as never);

    expect(stream.updateLabel).toHaveBeenCalledWith(3, detection);
  });

  it("is a no-op when no stream is mounted", () => {
    h.stream = null;
    const { result } = renderHook(() => useApplyPropagatedDetection());

    expect(() =>
      result.current(1, { instance: { _id: "x" } } as never)
    ).not.toThrow();
  });
});

describe("useApplyPropagationResult", () => {
  it("writes each per-frame detection from a sync result", () => {
    const stream = makeStream();
    h.stream = stream;
    const { result } = renderHook(() => useApplyPropagationResult());

    result.current({
      type: "sync",
      response: {
        perFrame: [
          { frameNumber: 2, detection: { _id: "a", instance: { _id: "i" } } },
          { frameNumber: 3, detection: { _id: "b", instance: { _id: "i" } } },
        ],
      },
    } as never);

    expect(stream.updateLabel).toHaveBeenCalledTimes(2);
    expect(stream.updateLabel).toHaveBeenCalledWith(
      2,
      expect.objectContaining({ _id: "a" })
    );
    expect(stream.updateLabel).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ _id: "b" })
    );
  });

  it("ignores a non-sync (streaming) result", () => {
    const stream = makeStream();
    h.stream = stream;
    const { result } = renderHook(() => useApplyPropagationResult());

    result.current({ type: "async" } as never);

    expect(stream.updateLabel).not.toHaveBeenCalled();
  });
});

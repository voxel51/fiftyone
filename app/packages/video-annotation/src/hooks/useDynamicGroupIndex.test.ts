/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * @vitest-environment jsdom
 */

import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getFrames: vi.fn(),
}));

vi.mock("../../../core/src/client/framesClient", () => ({
  getFrames: (...args: unknown[]) => h.getFrames(...args),
}));

import { useDynamicGroupIndex } from "./useDynamicGroupIndex";

const render = () =>
  renderHook(() =>
    useDynamicGroupIndex({
      active: true,
      sampleId: "member-1",
      dataset: "ds",
      view: [],
      slice: null,
      dynamicGroup: "scene-a",
      frameCount: 2,
    }),
  ).result;

describe("useDynamicGroupIndex", () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(() => {
    h.getFrames.mockReset();
    error.mockClear();
  });

  afterEach(() => {
    error.mockClear();
  });

  it("publishes the member order and the group token", async () => {
    h.getFrames.mockResolvedValue({
      frames: [
        { _id: "member-1", last_modified_at: "2026-09-01T10:00:00.000Z" },
        { _id: "member-2", last_modified_at: "2026-09-02T10:00:00.000Z" },
      ],
      range: [1, 2],
    });

    const result = render();
    await result.current.whenReady();

    expect(result.current.getState()).toEqual({
      index: ["member-1", "member-2"],
      token: "2026-09-02T10:00:00.000|2",
    });
  });

  it("fails the load by member name when a last_modified_at cannot be parsed", async () => {
    h.getFrames.mockResolvedValue({
      frames: [
        { _id: "member-1", last_modified_at: "2026-09-01T10:00:00.000Z" },
        { _id: "member-2", last_modified_at: null },
      ],
      range: [1, 2],
    });

    const result = render();
    await result.current.whenReady();

    // no half-built state: the write path refetches rather than sending a
    // token computed from a missing timestamp
    expect(result.current.getState()).toBeNull();
    expect(error).toHaveBeenCalledWith(
      "failed to load dynamic group member index",
      expect.objectContaining({
        message: expect.stringContaining("member-2"),
      }),
    );
  });
});

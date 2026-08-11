/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  endPointSession: vi.fn(),
  frame: { value: 1 },
}));

vi.mock("@fiftyone/annotation", () => ({
  useEndPointSession: () => hoisted.endPointSession,
}));

vi.mock("../state/useCurrentFrame", () => ({
  useCurrentFrame: () => hoisted.frame.value,
}));

import { useEndPointSessionOnFrameChange } from "./useEndPointSessionOnFrameChange";

describe("useEndPointSessionOnFrameChange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.frame.value = 1;
  });

  // Mounting isn't a frame change, and AI mode survives a surface remount, so
  // a session in progress must survive one too.
  it("does nothing on mount", () => {
    renderHook(() => useEndPointSessionOnFrameChange());

    expect(hoisted.endPointSession).not.toHaveBeenCalled();
  });

  it("ends the session when the playhead moves to another frame", () => {
    const { rerender } = renderHook(() => useEndPointSessionOnFrameChange());

    hoisted.frame.value = 2;
    rerender();

    expect(hoisted.endPointSession).toHaveBeenCalledTimes(1);
  });

  it("does nothing on a re-render that stays on the same frame", () => {
    const { rerender } = renderHook(() => useEndPointSessionOnFrameChange());

    rerender();

    expect(hoisted.endPointSession).not.toHaveBeenCalled();
  });
});

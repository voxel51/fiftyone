import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  pointSelection: {
    clearPoints: vi.fn(),
  },
  toolsState: {
    reset: vi.fn(),
  },
}));

vi.mock("./usePointSelection", () => ({
  usePointSelection: () => hoisted.pointSelection,
}));

vi.mock("./useToolsContext", () => ({
  useToolsState: () => hoisted.toolsState,
}));

import { useClearPointPrompts } from "./useClearPointPrompts";

describe("useClearPointPrompts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The overlay doesn't emit per-point delete events, so wiping only the
  // rendered keypoints would leave the cleared points in the next infer() call.
  it("clears the rendered points AND the prompt state", () => {
    const { result } = renderHook(() => useClearPointPrompts());

    result.current();

    expect(hoisted.pointSelection.clearPoints).toHaveBeenCalledTimes(1);
    expect(hoisted.toolsState.reset).toHaveBeenCalledTimes(1);
  });
});

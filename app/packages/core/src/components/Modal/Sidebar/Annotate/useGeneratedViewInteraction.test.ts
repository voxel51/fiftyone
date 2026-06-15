/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let mockIsGenerated = false;

vi.mock("@fiftyone/state", () => ({
  isGeneratedView: { key: "isGeneratedView" },
}));

vi.mock("recoil", () => ({
  useRecoilValue: () => mockIsGenerated,
}));

const { useGeneratedViewInteraction } = await import(
  "./useGeneratedViewInteraction"
);

describe("useGeneratedViewInteraction", () => {
  beforeEach(() => {
    mockIsGenerated = false;
  });

  it("does not intercept selects (no select method)", () => {
    const { result } = renderHook(() => useGeneratedViewInteraction());

    expect(result.current.interceptSelect).toBeUndefined();
  });

  it("consumes deselects in a generated view (sticky edit mode)", () => {
    mockIsGenerated = true;
    const { result } = renderHook(() => useGeneratedViewInteraction());

    expect(result.current.interceptDeselect?.("o1")).toBe(true);
  });

  it("passes deselects through outside a generated view", () => {
    mockIsGenerated = false;
    const { result } = renderHook(() => useGeneratedViewInteraction());

    expect(result.current.interceptDeselect?.("o1")).toBe(false);
  });
});

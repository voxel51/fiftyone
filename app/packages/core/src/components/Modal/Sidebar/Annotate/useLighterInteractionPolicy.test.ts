/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// sentinel interceptors — identity is all this test cares about
const MERGE = { tag: "merge" };
const GENERATED = { tag: "generated" };
const DRAFT = { tag: "draft" };

const mockCombine = vi.fn((interceptors: unknown[]) => ({ interceptors }));

vi.mock("@fiftyone/annotation", () => ({
  combineInteractionPolicies: (interceptors: unknown[]) =>
    mockCombine(interceptors),
}));

vi.mock("./useMergeToolInteraction", () => ({
  useMergeToolInteraction: () => MERGE,
}));
vi.mock("./useGeneratedViewInteraction", () => ({
  useGeneratedViewInteraction: () => GENERATED,
}));
vi.mock("./useDraftLockInteraction", () => ({
  useDraftLockInteraction: () => DRAFT,
}));

const { useLighterInteractionPolicy } = await import(
  "./useLighterInteractionPolicy"
);

describe("useLighterInteractionPolicy", () => {
  it("aggregates the interceptors in precedence order: merge → generated-view → draft", () => {
    renderHook(() => useLighterInteractionPolicy());

    expect(mockCombine).toHaveBeenCalledWith([MERGE, GENERATED, DRAFT]);
  });
});

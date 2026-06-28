// @vitest-environment jsdom
/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AnnotationEngine } from "../../../annotation/src/engine/core/engine";
import type { LabelRef } from "../../../annotation/src/engine/identity/ref";

// useAnnotationEngine reads from a jotai atom; share one engine per test by
// mocking the hook directly. This sidesteps store-registration plumbing the
// predicate doesn't care about — only `interaction.setActive(...)` matters.
let currentEngine: AnnotationEngine;

vi.mock("@fiftyone/annotation", async () => {
  const real = await vi.importActual<typeof import("@fiftyone/annotation")>(
    "@fiftyone/annotation",
  );
  return {
    ...real,
    useAnnotationEngine: () => currentEngine,
  };
});

import { useIsFrameLevelSelection } from "./useVideoInteraction";

const setActive = (refs: readonly LabelRef[]) => {
  currentEngine.interaction.setActive(refs);
};

describe("useIsFrameLevelSelection", () => {
  it("returns false on empty selection", () => {
    currentEngine = new AnnotationEngine();
    const { result } = renderHook(() => useIsFrameLevelSelection());
    expect(result.current).toBe(false);
  });

  it("returns true when the active ref is on a frames.* path", () => {
    currentEngine = new AnnotationEngine();
    const { result } = renderHook(() => useIsFrameLevelSelection());

    act(() => {
      setActive([
        { sample: "s1", path: "frames.detections", instanceId: "d1" },
      ]);
    });

    expect(result.current).toBe(true);
  });

  it("returns false when the active ref is on a sample-level (TD) path", () => {
    currentEngine = new AnnotationEngine();
    const { result } = renderHook(() => useIsFrameLevelSelection());

    act(() => {
      setActive([{ sample: "s1", path: "events", instanceId: "td1" }]);
    });

    expect(result.current).toBe(false);
  });

  it("returns false on a mixed selection (frame + sample-level)", () => {
    currentEngine = new AnnotationEngine();
    const { result } = renderHook(() => useIsFrameLevelSelection());

    act(() => {
      setActive([
        { sample: "s1", path: "frames.detections", instanceId: "d1" },
        { sample: "s1", path: "events", instanceId: "td1" },
      ]);
    });

    expect(result.current).toBe(false);
  });
});

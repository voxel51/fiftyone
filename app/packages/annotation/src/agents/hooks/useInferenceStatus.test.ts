/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

// Real jotai — the hook is a thin atom getter/setter, and using the real
// store gives us a free check that jotai integration still works.
import {
  useInferenceStatus,
  useSetInferenceProgress,
  useSetInferenceStatus,
} from "./useInferenceStatus";

describe("useInferenceStatus", () => {
  it("initial state: status='idle', progress=null", () => {
    const { result } = renderHook(() => useInferenceStatus());
    expect(result.current.status).toBe("idle");
    expect(result.current.progress).toBeNull();
  });

  it("setStatus updates the value observed by useInferenceStatus", () => {
    const { result } = renderHook(() => ({
      view: useInferenceStatus(),
      setStatus: useSetInferenceStatus(),
    }));

    act(() => result.current.setStatus("inferring"));
    expect(result.current.view.status).toBe("inferring");

    act(() => result.current.setStatus("idle"));
    expect(result.current.view.status).toBe("idle");
  });

  it("setProgress updates the value observed by useInferenceStatus", () => {
    const { result } = renderHook(() => ({
      view: useInferenceStatus(),
      setProgress: useSetInferenceProgress(),
    }));

    const snapshot = { file: "encoder", loaded: 50, total: 100 };
    act(() => result.current.setProgress(snapshot));
    expect(result.current.view.progress).toEqual(snapshot);

    act(() => result.current.setProgress(null));
    expect(result.current.view.progress).toBeNull();
  });

  it("walks through the typical agent lifecycle order", () => {
    const { result } = renderHook(() => ({
      view: useInferenceStatus(),
      setStatus: useSetInferenceStatus(),
    }));

    const transitions = [
      "initializing",
      "downloading-weights",
      "encoding-image",
      "inferring",
      "idle",
    ] as const;

    for (const next of transitions) {
      act(() => result.current.setStatus(next));
      expect(result.current.view.status).toBe(next);
    }
  });
});

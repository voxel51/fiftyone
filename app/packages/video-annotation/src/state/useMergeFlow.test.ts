/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useMergeFlow } from "./useMergeFlow";

describe("useMergeFlow", () => {
  // module-level atom — clear after each test so cases don't leak state
  afterEach(() => {
    const { result } = renderHook(() => useMergeFlow());
    act(() => result.current.cancelMerge());
  });

  it("starts in the cleared state", () => {
    const { result } = renderHook(() => useMergeFlow());

    expect(result.current.pending).toBe(false);
    expect(result.current.target).toBeNull();
  });

  it("beginMerge captures the target and flips pending true", () => {
    const { result } = renderHook(() => useMergeFlow());

    act(() => result.current.beginMerge("A"));

    expect(result.current.pending).toBe(true);
    expect(result.current.target).toBe("A");
  });

  it("cancelMerge clears the target", () => {
    const { result } = renderHook(() => useMergeFlow());

    act(() => result.current.beginMerge("A"));
    act(() => result.current.cancelMerge());

    expect(result.current.pending).toBe(false);
    expect(result.current.target).toBeNull();
  });

  it("consumeMerge returns null and stays cleared when not pending", () => {
    const { result } = renderHook(() => useMergeFlow());

    let pair: { source: string; target: string } | null = null;
    act(() => {
      pair = result.current.consumeMerge("B");
    });

    expect(pair).toBeNull();
    expect(result.current.pending).toBe(false);
  });

  it("consumeMerge yields {source, target} and clears pending on a different track", () => {
    const { result } = renderHook(() => useMergeFlow());

    act(() => result.current.beginMerge("A"));

    let pair: { source: string; target: string } | null = null;
    act(() => {
      pair = result.current.consumeMerge("B");
    });

    expect(pair).toEqual({ source: "B", target: "A" });
    expect(result.current.pending).toBe(false);
    expect(result.current.target).toBeNull();
  });

  it("consumeMerge on the target itself clears state but yields no merge", () => {
    const { result } = renderHook(() => useMergeFlow());

    act(() => result.current.beginMerge("A"));

    let pair: { source: string; target: string } | null = null;
    act(() => {
      pair = result.current.consumeMerge("A");
    });

    expect(pair).toBeNull();
    // self-click still exits pending so the user isn't stuck
    expect(result.current.pending).toBe(false);
    expect(result.current.target).toBeNull();
  });

  it("beginMerge while already pending replaces the target", () => {
    const { result } = renderHook(() => useMergeFlow());

    act(() => result.current.beginMerge("A"));
    act(() => result.current.beginMerge("C"));

    expect(result.current.target).toBe("C");
  });
});

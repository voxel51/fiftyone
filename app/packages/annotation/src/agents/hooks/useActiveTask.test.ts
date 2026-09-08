/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AgentTaskType } from "../types";
import { useActiveTask } from "./useActiveTask";

describe("useActiveTask", () => {
  it("initial state: activeTask=null", () => {
    const { result } = renderHook(() => useActiveTask());
    expect(result.current.activeTask).toBeNull();
  });

  it("setActiveTask updates the observed value", () => {
    const { result } = renderHook(() => useActiveTask());

    act(() => result.current.setActiveTask(AgentTaskType.SEGMENT));
    expect(result.current.activeTask).toBe(AgentTaskType.SEGMENT);

    act(() => result.current.setActiveTask(AgentTaskType.DETECT));
    expect(result.current.activeTask).toBe(AgentTaskType.DETECT);

    act(() => result.current.setActiveTask(null));
    expect(result.current.activeTask).toBeNull();
  });

  it("returns a memoized object — same reference when the task hasn't changed", () => {
    const { result, rerender } = renderHook(() => useActiveTask());

    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("returns a new object when the task changes", () => {
    const { result } = renderHook(() => useActiveTask());

    const before = result.current;
    act(() => result.current.setActiveTask(AgentTaskType.SEGMENT));
    expect(result.current).not.toBe(before);
  });
});

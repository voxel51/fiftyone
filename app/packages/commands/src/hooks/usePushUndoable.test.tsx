import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { usePushUndoable } from "./usePushUndoable";
import { CommandContextManager, KnownContexts } from "../context";

describe("usePushUndoable", () => {
  beforeEach(() => {
    CommandContextManager.instance().reset();
  });

  it("should execute and push to active context", () => {
    const { result } = renderHook(() => usePushUndoable()); // uses active context
    const mgr = CommandContextManager.instance();
    const ctx = mgr.getActiveContext();

    expect(ctx.id).toBe(KnownContexts.Default);
    expect(ctx.canUndo()).toBe(false);

    const execFn = vi.fn();
    const undoFn = vi.fn();

    act(() => {
      result.current.createPushAndExec("test-action", execFn, undoFn);
    });

    expect(execFn).toHaveBeenCalled();
    expect(ctx.canUndo()).toBe(true);

    // Verify undo works
    ctx.undo();
    expect(undoFn).toHaveBeenCalled();
  });

  it("should execute and push to specified context", () => {
    const otherContextId = "other-context";
    const mgr = CommandContextManager.instance();
    const otherCtx = mgr.createCommandContext(
      otherContextId,
      KnownContexts.Default,
      false
    );

    // Active context is still `contextId` from beforeEach

    const { result } = renderHook(() => usePushUndoable(otherContextId));

    const execFn = vi.fn();
    const undoFn = vi.fn();

    act(() => {
      result.current.createPushAndExec("test-action-other", execFn, undoFn);
    });

    expect(execFn).toHaveBeenCalled();

    expect(otherCtx.canUndo()).toBe(true);
    // Active context should NOT be affected
    expect(mgr.getActiveContext().canUndo()).toBe(false);

    mgr.deleteContext(otherContextId);
  });

  it("should warn if context not found", () => {
    const missingId = "missing-context";
    const { result } = renderHook(() => usePushUndoable(missingId));
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const execFn = vi.fn();
    const undoFn = vi.fn();

    act(() => {
      result.current.createPushAndExec("test-missing", execFn, undoFn);
    });

    expect(consoleSpy).toHaveBeenCalled();
    expect(execFn).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

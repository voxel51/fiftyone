import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { usePushUndoable } from "./usePushUndoable";
import { CommandContextManager } from "../context";

describe("usePushUndoable", () => {
  const contextId = "test-push-undoable-context";

  beforeEach(() => {
    const mgr = CommandContextManager.instance();
    if (mgr.getCommandContext(contextId)) {
      mgr.deleteContext(contextId);
    }
    const ctx = mgr.createCommandContext(contextId, false);
    mgr.pushContext(ctx);
  });

  afterEach(() => {
    const mgr = CommandContextManager.instance();
    // Pop implementation prevents popping last one sometimes, or need explicit pop if we pushed
    // But for cleanup, we just delete context
    if (mgr.getCommandContext(contextId)) {
      mgr.deleteContext(contextId);
    }
    // Ideally reset manager to clean state, but singleton persists.
    // We pushed context, so let's pop it to be clean for others
    const active = mgr.getActiveContext();
    if (active.id === contextId) {
      mgr.popContext(contextId);
    }
  });

  it("should execute and push to active context", () => {
    const { result } = renderHook(() => usePushUndoable()); // uses active context
    const mgr = CommandContextManager.instance();
    const ctx = mgr.getActiveContext();

    expect(ctx.id).toBe(contextId);
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
    const otherCtx = mgr.createCommandContext(otherContextId, false);

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
    expect(execFn).not.toHaveBeenCalled(); // Should assume safety check skips exec?
    // Checking source:
    /*
          if (contextId) {
            context = manager.getCommandContext(contextId);
            if (!context) {
              console.warn(...)
              return; 
            }
          }
        */
    // Yes, it returns early.

    consoleSpy.mockRestore();
  });
});

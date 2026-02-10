import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useUndoRedo } from "./useUndoRedo";
import { CommandContextManager, KnownContexts } from "../context";
import { DelegatingUndoable } from "../actions";

describe("useUndoRedo", () => {
  beforeEach(() => {
    CommandContextManager.instance().reset();
  });

  const pushUndoable = (id = "test") => {
    const mgr = CommandContextManager.instance();
    const ctx = mgr.getActiveContext();
    const undoable = new DelegatingUndoable(id, vi.fn(), vi.fn());
    ctx.pushUndoable(undoable);
  };

  it("should initialize with correct state", () => {
    const { result } = renderHook(() => useUndoRedo());

    expect(result.current.undoEnabled).toBe(false);
    expect(result.current.redoEnabled).toBe(false);
  });

  it("should update state when undoable pushed", () => {
    const { result } = renderHook(() => useUndoRedo());

    act(() => {
      pushUndoable("action1");
    });

    expect(result.current.undoEnabled).toBe(true);
    expect(result.current.redoEnabled).toBe(false);
  });

  it("should perform undo and update state", async () => {
    const { result } = renderHook(() => useUndoRedo());

    act(() => {
      pushUndoable("action1");
    });

    await act(async () => {
      await result.current.undo();
    });

    expect(result.current.undoEnabled).toBe(false);
    expect(result.current.redoEnabled).toBe(true);
  });

  it("should perform redo and update state", async () => {
    const { result } = renderHook(() => useUndoRedo());

    act(() => {
      pushUndoable("action1");
    });

    await act(async () => {
      await result.current.undo();
    });

    await act(async () => {
      await result.current.redo();
    });

    expect(result.current.undoEnabled).toBe(true);
    expect(result.current.redoEnabled).toBe(false);
  });

  it("should clear the stack", () => {
    const { result } = renderHook(() => useUndoRedo());

    act(() => {
      pushUndoable("action1");
    });

    expect(result.current.undoEnabled).toBe(true);

    act(() => {
      result.current.clear();
    });

    expect(result.current.undoEnabled).toBe(false);
    expect(result.current.redoEnabled).toBe(false);
  });

  it("should use specified context", () => {
    const otherId = "other-undo-context";
    const mgr = CommandContextManager.instance();
    const otherCtx = mgr.createCommandContext(
      otherId,
      KnownContexts.Default,
      false
    );
    // Context must be active to emit update events
    mgr.activateContext(otherId);

    const { result } = renderHook(() => useUndoRedo(otherId));

    expect(result.current.undoEnabled).toBe(false);

    act(() => {
      const undoable = new DelegatingUndoable("test", vi.fn(), vi.fn());
      otherCtx.pushUndoable(undoable);
    });

    expect(result.current.undoEnabled).toBe(true);

    // Create another context to be "Active" on top
    const topId = "top-context";
    const topCtx = mgr.createCommandContext(
      topId,
      KnownContexts.Default,
      false
    );
    mgr.activateContext(topId);

    // Active context (topCtx) shouldn't affect otherCtx
    act(() => {
      // pushUndoable helper uses mgr.getActiveContext(), which is now topCtx
      pushUndoable("active-action-top");
    });

    // Should still be true (1 item in otherCtx)
    // If otherCtx listened to topCtx actions, it might be different, but they are independent (no inheritance)
    expect(result.current.undoEnabled).toBe(true);
    // Also verify topCtx has item?
    expect(topCtx.canUndo()).toBe(true);

    mgr.deactivateContext(topId);
    mgr.deleteContext(topId);

    mgr.deleteContext(otherId);
  });
});

import { describe, it, vi, beforeEach, expect } from "vitest";
import { ActionManager } from "./ActionManager";
import { DelegatingUndoable } from "./Undoable";

describe("ActionManager", () => {
  let manager: ActionManager;
  let execFn: () => void;
  let undoFn: () => void;
  let action: DelegatingUndoable;
  beforeEach(() => {
    manager = new ActionManager();
    execFn = vi.fn(() => {
      return;
    });
    undoFn = vi.fn(() => {
      return;
    });
    action = new DelegatingUndoable("fo.test", execFn, undoFn);
  });

  it("can do/undo/redo an action", async () => {
    await manager.execute(action);
    expect(execFn).toBeCalledTimes(1);
    expect(undoFn).toBeCalledTimes(0);
    expect(manager.canUndo()).toBe(true);
    expect(manager.canRedo()).toBe(false);
    await manager.undo();
    expect(undoFn).toBeCalledTimes(1);
    expect(execFn).toBeCalledTimes(1);
    expect(manager.canRedo()).toBe(true);
    expect(manager.canUndo()).toBe(false);
    await manager.redo();
    expect(execFn).toBeCalledTimes(2);
    expect(undoFn).toBeCalledTimes(1);
    expect(manager.canRedo()).toBe(false);
    expect(manager.canUndo()).toBe(true);
  });

  it("fires action events on execute/undo/redo", async () => {
    const listener = vi.fn((_id, _isUndo) => {
      return;
    });
    const unsub = manager.subscribeActions(listener);
    await manager.execute(action);
    expect(listener).toBeCalledTimes(1);
    expect(listener.mock.calls[0][0]).toBe(action.id);
    expect(listener.mock.calls[0][1]).toBe(false);
    await manager.undo();
    expect(listener).toBeCalledTimes(2);
    expect(listener.mock.calls[1][0]).toBe(action.id);
    expect(listener.mock.calls[1][1]).toBe(true);
    await manager.redo();
    expect(listener).toBeCalledTimes(3);
    expect(listener.mock.calls[2][0]).toBe(action.id);
    expect(listener.mock.calls[2][1]).toBe(false);
    unsub();
    await manager.undo();
    //not called after unsub
    expect(listener).toBeCalledTimes(3);
  });

  describe("prune", () => {
    const make = (id: string) =>
      new DelegatingUndoable(
        id,
        () => {
          return;
        },
        () => {
          return;
        },
      );

    it("removes matching entries from the undo stack", async () => {
      await manager.execute(make("keep.a"));
      await manager.execute(make("drop.a"));
      await manager.execute(make("keep.b"));
      await manager.execute(make("drop.b"));
      expect(manager.getUndoStackSize()).toBe(4);

      manager.prune((u) => u.id.startsWith("drop."));

      expect(manager.getUndoStackSize()).toBe(2);
      expect(manager.canUndo()).toBe(true);
    });

    it("removes matching entries from the redo stack", async () => {
      await manager.execute(make("drop.a"));
      await manager.execute(make("keep.a"));
      await manager.undo();
      await manager.undo();
      expect(manager.getRedoStackSize()).toBe(2);

      manager.prune((u) => u.id === "drop.a");

      expect(manager.getRedoStackSize()).toBe(1);
      expect(manager.getUndoStackSize()).toBe(0);
    });

    it("fires undo listeners when entries are removed", async () => {
      await manager.execute(make("drop.a"));
      const listener = vi.fn();
      manager.subscribeUndo(listener);

      manager.prune((u) => u.id === "drop.a");

      expect(listener).toBeCalledTimes(1);
      expect(listener.mock.calls[0]).toEqual([false, false]);
    });

    it("does not fire undo listeners when nothing matches", async () => {
      await manager.execute(make("keep.a"));
      const listener = vi.fn();
      manager.subscribeUndo(listener);

      manager.prune((u) => u.id === "nothing.matches");

      expect(listener).not.toBeCalled();
    });

    it("is a no-op on empty stacks", () => {
      const listener = vi.fn();
      manager.subscribeUndo(listener);

      manager.prune(() => true);

      expect(listener).not.toBeCalled();
      expect(manager.getUndoStackSize()).toBe(0);
      expect(manager.getRedoStackSize()).toBe(0);
    });
  });
});

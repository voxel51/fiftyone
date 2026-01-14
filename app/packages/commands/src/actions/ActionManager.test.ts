import { describe, it, vi, beforeEach, expect } from "vitest";
import { ActionManager } from "./ActionManager";
import { DelegatingUndoable } from "./Undoable";

describe("ActionManager", () => {
  let manager: ActionManager;
  let execFn: () => Promise<void>;
  let undoFn: () => Promise<void>;
  let action: DelegatingUndoable;
  beforeEach(() => {
    manager = new ActionManager();
    execFn = vi.fn(async () => {
      return;
    });
    undoFn = vi.fn(async () => {
      return;
    });
    action = new DelegatingUndoable("fo.test", execFn, undoFn);
  });

  it("can do/undo/redo an action", () => {
    manager.execute(action);
    expect(execFn).toBeCalledTimes(1);
    expect(undoFn).toBeCalledTimes(0);
    expect(manager.canUndo()).toBe(true);
    expect(manager.canRedo()).toBe(false);
    manager.undo();
    expect(undoFn).toBeCalledTimes(1);
    expect(execFn).toBeCalledTimes(1);
    expect(manager.canRedo()).toBe(true);
    expect(manager.canUndo()).toBe(false);
    manager.redo();
    expect(execFn).toBeCalledTimes(2);
    expect(undoFn).toBeCalledTimes(1);
    expect(manager.canRedo()).toBe(false);
    expect(manager.canUndo()).toBe(true);
  });

  it("fires action events on execute/undo/redo", () => {
    const listener = vi.fn((_id, _isUndo) => {
      return;
    });
    const unsub = manager.subscribeActions(listener);
    manager.execute(action);
    expect(listener).toBeCalledTimes(1);
    expect(listener.mock.calls[0][0]).toBe(action.id);
    expect(listener.mock.calls[0][1]).toBe(false);
    manager.undo();
    expect(listener).toBeCalledTimes(2);
    expect(listener.mock.calls[1][0]).toBe(action.id);
    expect(listener.mock.calls[1][1]).toBe(true);
    manager.redo();
    expect(listener).toBeCalledTimes(3);
    expect(listener.mock.calls[2][0]).toBe(action.id);
    expect(listener.mock.calls[2][1]).toBe(false);
    unsub();
    manager.undo();
    //not called after unsub
    expect(listener).toBeCalledTimes(3);
  });
});

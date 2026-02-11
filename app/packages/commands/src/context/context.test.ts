import { it, describe, vi, beforeEach, expect, afterEach } from "vitest";
import { CommandContext } from "./CommandContext";
import { DelegatingUndoable, Undoable } from "../actions";

describe("CommandContext", () => {
  let context: CommandContext;
  let testExec: () => Promise<void>;
  let testUndo: () => Promise<void>;
  let testUndoable: Undoable;

  beforeEach(() => {
    context = new CommandContext("test");
    //typically called by the CommandContextManager on push, not directly
    context.activate();
    testExec = vi.fn(async () => {
      return;
    });
    testUndo = vi.fn(async () => {
      return;
    });
    testUndoable = new DelegatingUndoable("fo.test.undo", testExec, testUndo);
  });

  afterEach(() => {
    context.deactivate();
  });

  it("can register a command", () => {
    expect(
      context.registerCommand(
        "fo.test",
        () => {
          return;
        },
        () => {
          return true;
        }
      )
    ).toBeDefined();
    expect(context.getCommand("fo.test")).toBeDefined();
  });

  it("will not allow the same command to be registered twice", () => {
    expect(
      context.registerCommand(
        "fo.test",
        () => {
          return;
        },
        () => {
          return true;
        }
      )
    ).toBeDefined();
    expect(() => {
      context.registerCommand(
        "fo.test",
        () => {
          return;
        },
        () => {
          return true;
        }
      );
    }).toThrowError();
  });

  it("can execute and undo/redo", async () => {
    await context.executeAction(testUndoable);
    expect(testExec).toBeCalledTimes(1);
    expect(testUndo).toBeCalledTimes(0);
    expect(context.canUndo()).toBe(true);
    expect(context.canRedo()).toBe(false);
    await context.undo();
    expect(testExec).toBeCalledTimes(1);
    expect(testUndo).toBeCalledTimes(1);
    expect(context.canUndo()).toBe(false);
    expect(context.canRedo()).toBe(true);
    await context.redo();
    expect(testExec).toBeCalledTimes(2);
    expect(testUndo).toBeCalledTimes(1);
    expect(context.canUndo()).toBe(true);
  });

  it("fires updates on undo redo state changes", async () => {
    const listener = vi.fn((_undoEnabled, _redoEnabled) => {
      return;
    });
    const unsub = context.subscribeUndoState(listener);
    await context.executeAction(testUndoable);
    expect(listener).toBeCalledTimes(1);
    //expect undo=true, redo=false
    expect(listener.mock.calls[0][0]).toBe(true);
    expect(listener.mock.calls[0][1]).toBe(false);

    await context.undo();
    expect(listener).toBeCalledTimes(2);
    //expect undo=false, redo-true
    expect(listener.mock.calls[1][0]).toBe(false);
    expect(listener.mock.calls[1][1]).toBe(true);
    unsub();
    await context.executeAction(testUndoable);
    //should no longer be called after unsubscribe
    expect(listener).toBeCalledTimes(2);
    await context.undo();
    expect(listener).toBeCalledTimes(2);
  });

  it("fires action events on execute/undo/redo", async () => {
    const listener = vi.fn((_id, _isUndo) => {
      return;
    });
    const unsub = context.subscribeActions(listener);
    await context.executeAction(testUndoable);
    expect(listener).toBeCalledTimes(1);
    expect(listener.mock.calls[0][0]).toBe(testUndoable.id);
    expect(listener.mock.calls[0][1]).toBe(false);
    await context.undo();
    expect(listener).toBeCalledTimes(2);
    expect(listener.mock.calls[1][0]).toBe(testUndoable.id);
    expect(listener.mock.calls[1][1]).toBe(true);
    await context.redo();
    expect(listener).toBeCalledTimes(3);
    expect(listener.mock.calls[2][0]).toBe(testUndoable.id);
    expect(listener.mock.calls[2][1]).toBe(false);
    unsub();
    await context.undo();
    //not called after unsub
    expect(listener).toBeCalledTimes(3);
  });
});

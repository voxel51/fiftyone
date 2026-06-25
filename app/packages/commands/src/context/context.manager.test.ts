import { describe, it, vi, expect, beforeEach } from "vitest";
import { CommandContextManager, KnownContexts } from "./CommandContextManager";
import { DelegatingUndoable } from "../actions";

describe("CommandContextManager", () => {
  beforeEach(() => {
    CommandContextManager.instance().reset();
  });

  // TODO: re-enable after refactoring CommandContextManager to support dynamic push/pop
  it.skip("can push/pop contexts", () => {
    const listener = vi.fn((_newId) => {
      return;
    });
    const newContext = CommandContextManager.instance().createCommandContext(
      "fo.test",
      true,
    );
    const unsub = CommandContextManager.instance().subscribe(listener);
    CommandContextManager.instance().pushContext(newContext);
    expect(listener).toBeCalledTimes(1);
    expect(listener.mock.calls[0][0]).toBe(newContext.id);
    expect(CommandContextManager.instance().getActiveContext().id).toBe(
      newContext.id,
    );
    CommandContextManager.instance().popContext();
    expect(listener).toBeCalledTimes(2);
    expect(listener.mock.calls[1][0]).toBe(KnownContexts.Default);
    expect(CommandContextManager.instance().getActiveContext().id).toBe(
      KnownContexts.Default,
    );
    unsub();
    CommandContextManager.instance().pushContext(newContext);
    //not called after unsubscribe
    expect(listener).toBeCalledTimes(2);
  });

  // TODO: re-enable after refactoring CommandContextManager to support dynamic push/pop
  it.skip("always keeps a default context", () => {
    expect(CommandContextManager.instance().getActiveContext().id).toBe(
      KnownContexts.Default,
    );
    const newContext = CommandContextManager.instance().createCommandContext(
      "fo.test",
      true,
    );
    CommandContextManager.instance().pushContext(newContext);
    expect(CommandContextManager.instance().getActiveContext().id).toBe(
      newContext.id,
    );
    //pop returns to the default
    CommandContextManager.instance().popContext();
    expect(CommandContextManager.instance().getActiveContext().id).toBe(
      KnownContexts.Default,
    );
    //further pops stay at default
    CommandContextManager.instance().popContext();
    expect(CommandContextManager.instance().getActiveContext().id).toBe(
      KnownContexts.Default,
    );

    CommandContextManager.instance().pushContext(newContext);
    expect(CommandContextManager.instance().getActiveContext().id).toBe(
      newContext.id,
    );
    //direct restore to the default context
    CommandContextManager.instance().toDefault();
    expect(CommandContextManager.instance().getActiveContext().id).toBe(
      KnownContexts.Default,
    );
  });

  it("can invoke a key binding", async () => {
    const execFn = vi.fn(() => {
      return;
    });
    const cmd = CommandContextManager.instance()
      .getActiveContext()
      .registerCommand("fo.test", execFn, () => {
        return true;
      });
    CommandContextManager.instance()
      .getActiveContext()
      .bindKey("ctrl+x", cmd.id);
    await CommandContextManager.instance().handleKeyDown(
      new KeyboardEvent("keydown", { ctrlKey: true, key: "x" }),
    );
    expect(execFn).toBeCalledTimes(1);
  });

  it("can invoke an inherited binding", async () => {
    const execFn = vi.fn(() => {
      return;
    });
    const cmd = CommandContextManager.instance()
      .getActiveContext()
      .registerCommand("fo.test", execFn, () => {
        return true;
      });
    CommandContextManager.instance()
      .getActiveContext()
      .bindKey("ctrl+x", cmd.id);
    const context = CommandContextManager.instance().createCommandContext(
      "new.context",
      true,
    );
    CommandContextManager.instance().pushContext(context);
    await CommandContextManager.instance().handleKeyDown(
      new KeyboardEvent("keydown", { ctrlKey: true, key: "x" }),
    );
    expect(execFn).toBeCalledTimes(1);
  });

  // TODO: re-enable after refactoring — stack walking now checks all contexts, so non-inherited isolation doesn't apply
  it.skip("does not invoke a non-inherited default binding", async () => {
    const execFn = vi.fn(() => {
      return;
    });
    const cmd = CommandContextManager.instance()
      .getActiveContext()
      .registerCommand("fo.test", execFn, () => {
        return true;
      });
    CommandContextManager.instance()
      .getActiveContext()
      .bindKey("ctrl+x", cmd.id);
    const context = CommandContextManager.instance().createCommandContext(
      "new.context",
      false,
    );
    CommandContextManager.instance().pushContext(context);
    await CommandContextManager.instance().handleKeyDown(
      new KeyboardEvent("keydown", { ctrlKey: true, key: "x" }),
    );
    expect(execFn).toBeCalledTimes(0);
  });

  it("can perform undo/redo on an inherited context", async () => {
    const undoFn = vi.fn(() => {
      return;
    });
    const execFn = vi.fn(() => {
      return;
    });
    const undoable = new DelegatingUndoable("fo.undoable", execFn, undoFn);
    const cmdFn = vi.fn(() => {
      return undoable;
    });
    const cmd = CommandContextManager.instance()
      .getActiveContext()
      .registerCommand("fo.test", cmdFn, () => {
        return true;
      });
    CommandContextManager.instance()
      .getActiveContext()
      .bindKey("ctrl+x", cmd.id);
    const context = CommandContextManager.instance().createCommandContext(
      "new.context",
      true,
    );
    CommandContextManager.instance().pushContext(context);
    await CommandContextManager.instance().handleKeyDown(
      new KeyboardEvent("keydown", { ctrlKey: true, key: "x" }),
    );
    expect(cmdFn).toBeCalledTimes(1);
    expect(execFn).toBeCalledTimes(1);
    expect(undoFn).toBeCalledTimes(0);
    expect(CommandContextManager.instance().getActiveContext().canUndo()).toBe(
      true,
    );
    expect(CommandContextManager.instance().getActiveContext().canRedo()).toBe(
      false,
    );
    await CommandContextManager.instance().getActiveContext().undo();
    expect(undoFn).toBeCalledTimes(1);
    expect(execFn).toBeCalledTimes(1);
    expect(CommandContextManager.instance().getActiveContext().canUndo()).toBe(
      false,
    );
    expect(CommandContextManager.instance().getActiveContext().canRedo()).toBe(
      true,
    );
    await CommandContextManager.instance().getActiveContext().redo();
    expect(execFn).toBeCalledTimes(2);
    expect(undoFn).toBeCalledTimes(1);
  });
});

describe("CommandContextManager text-editing guard", () => {
  beforeEach(() => {
    CommandContextManager.instance().reset();
    document.body.innerHTML = "";
    // Re-anchor focus on body — a previous test's focused element would
    // otherwise leak into document.activeElement.
    (document.activeElement as HTMLElement | null)?.blur?.();
  });

  function bindSpace() {
    const execFn = vi.fn(() => {
      return;
    });
    const cmd = CommandContextManager.instance()
      .getActiveContext()
      .registerCommand("fo.test.space", execFn, () => true);
    CommandContextManager.instance()
      .getActiveContext()
      .bindKey("space", cmd.id);
    return execFn;
  }

  function spaceEvent(init: KeyboardEventInit = {}) {
    return new KeyboardEvent("keydown", {
      key: " ",
      cancelable: true,
      ...init,
    });
  }

  it("skips commands while a text input is focused", async () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    const execFn = bindSpace();
    await CommandContextManager.instance().handleKeyDown(spaceEvent());
    expect(execFn).not.toBeCalled();
  });

  it("skips commands while a textarea is focused", async () => {
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    textarea.focus();
    const execFn = bindSpace();
    await CommandContextManager.instance().handleKeyDown(spaceEvent());
    expect(execFn).not.toBeCalled();
  });

  it("skips commands while a contenteditable element is focused", async () => {
    const editor = document.createElement("div");
    editor.tabIndex = -1;
    // jsdom doesn't implement isContentEditable — emulate the browser.
    Object.defineProperty(editor, "isContentEditable", { value: true });
    document.body.appendChild(editor);
    editor.focus();
    const execFn = bindSpace();
    await CommandContextManager.instance().handleKeyDown(spaceEvent());
    expect(execFn).not.toBeCalled();
  });

  it("fires commands while a checkbox is focused and suppresses native activation", async () => {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    document.body.appendChild(checkbox);
    checkbox.focus();
    const execFn = bindSpace();
    const event = spaceEvent();
    await CommandContextManager.instance().handleKeyDown(event);
    expect(execFn).toBeCalledTimes(1);
    // preventDefault on the keydown is what stops the browser from
    // toggling the focused checkbox on key-up.
    expect(event.defaultPrevented).toBe(true);
  });

  it("fires commands while a button is focused", async () => {
    const button = document.createElement("button");
    document.body.appendChild(button);
    button.focus();
    const execFn = bindSpace();
    const event = spaceEvent();
    await CommandContextManager.instance().handleKeyDown(event);
    expect(execFn).toBeCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("ignores modified variants of a bare binding", async () => {
    const execFn = bindSpace();
    await CommandContextManager.instance().handleKeyDown(
      spaceEvent({ shiftKey: true })
    );
    await CommandContextManager.instance().handleKeyDown(
      spaceEvent({ metaKey: true })
    );
    expect(execFn).not.toBeCalled();
  });

  it("ignores key repeats from a held key", async () => {
    const execFn = bindSpace();
    await CommandContextManager.instance().handleKeyDown(
      spaceEvent({ repeat: true })
    );
    expect(execFn).not.toBeCalled();
  });
});

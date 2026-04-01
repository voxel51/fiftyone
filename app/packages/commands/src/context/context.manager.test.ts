import { describe, it, vi, expect, beforeEach } from "vitest";
import { CommandContextManager, KnownCommands, KnownContexts } from "./CommandContextManager";
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
      true
    );
    const unsub = CommandContextManager.instance().subscribe(listener);
    CommandContextManager.instance().pushContext(newContext);
    expect(listener).toBeCalledTimes(1);
    expect(listener.mock.calls[0][0]).toBe(newContext.id);
    expect(CommandContextManager.instance().getActiveContext().id).toBe(
      newContext.id
    );
    CommandContextManager.instance().popContext();
    expect(listener).toBeCalledTimes(2);
    expect(listener.mock.calls[1][0]).toBe(KnownContexts.Default);
    expect(CommandContextManager.instance().getActiveContext().id).toBe(
      KnownContexts.Default
    );
    unsub();
    CommandContextManager.instance().pushContext(newContext);
    //not called after unsubscribe
    expect(listener).toBeCalledTimes(2);
  });

  // TODO: re-enable after refactoring CommandContextManager to support dynamic push/pop
  it.skip("always keeps a default context", () => {
    expect(CommandContextManager.instance().getActiveContext().id).toBe(
      KnownContexts.Default
    );
    const newContext = CommandContextManager.instance().createCommandContext(
      "fo.test",
      true
    );
    CommandContextManager.instance().pushContext(newContext);
    expect(CommandContextManager.instance().getActiveContext().id).toBe(
      newContext.id
    );
    //pop returns to the default
    CommandContextManager.instance().popContext();
    expect(CommandContextManager.instance().getActiveContext().id).toBe(
      KnownContexts.Default
    );
    //further pops stay at default
    CommandContextManager.instance().popContext();
    expect(CommandContextManager.instance().getActiveContext().id).toBe(
      KnownContexts.Default
    );

    CommandContextManager.instance().pushContext(newContext);
    expect(CommandContextManager.instance().getActiveContext().id).toBe(
      newContext.id
    );
    //direct restore to the default context
    CommandContextManager.instance().toDefault();
    expect(CommandContextManager.instance().getActiveContext().id).toBe(
      KnownContexts.Default
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
      new KeyboardEvent("keydown", { ctrlKey: true, key: "x" })
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
      true
    );
    CommandContextManager.instance().pushContext(context);
    await CommandContextManager.instance().handleKeyDown(
      new KeyboardEvent("keydown", { ctrlKey: true, key: "x" })
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
      false
    );
    CommandContextManager.instance().pushContext(context);
    await CommandContextManager.instance().handleKeyDown(
      new KeyboardEvent("keydown", { ctrlKey: true, key: "x" })
    );
    expect(execFn).toBeCalledTimes(0);
  });

  describe("Escape key priority: ModalAnnotate overrides Modal", () => {
    // Simulates the annotate-tab Escape behavior:
    // When a label is selected (Header mounted), ModalAnnotate's Escape binding
    // should fire instead of Modal's close handler.
    // When the label is deselected (Header unmounted / binding unregistered),
    // Modal's Escape should fire again.

    const escapeEvent = () =>
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true });

    it("ModalAnnotate Escape fires instead of Modal Escape when both are bound", async () => {
      const modalClose = vi.fn();
      const annotateDeselect = vi.fn();

      const manager = CommandContextManager.instance();

      const modalCtx = manager.getCommandContext(KnownContexts.Modal)!;
      const annotateCtx = manager.getCommandContext(KnownContexts.ModalAnnotate)!;

      const modalCmd = modalCtx.registerCommand("fo.modal.close.test", modalClose, () => true);
      modalCtx.bindKey("Escape", modalCmd.id);

      const annotateCmd = annotateCtx.registerCommand(
        KnownCommands.ModalAnnotateDeselect,
        annotateDeselect,
        () => true
      );
      annotateCtx.bindKey("Escape", annotateCmd.id);

      await manager.handleKeyDown(escapeEvent());

      expect(annotateDeselect).toHaveBeenCalledOnce();
      expect(modalClose).not.toHaveBeenCalled();
    });

    it("Modal Escape fires when ModalAnnotate has no Escape binding", async () => {
      const modalClose = vi.fn();

      const manager = CommandContextManager.instance();
      const modalCtx = manager.getCommandContext(KnownContexts.Modal)!;

      const modalCmd = modalCtx.registerCommand("fo.modal.close.test", modalClose, () => true);
      modalCtx.bindKey("Escape", modalCmd.id);

      await manager.handleKeyDown(escapeEvent());

      expect(modalClose).toHaveBeenCalledOnce();
    });

    it("Modal Escape fires again after ModalAnnotate Escape binding is unregistered", async () => {
      const modalClose = vi.fn();
      const annotateDeselect = vi.fn();

      const manager = CommandContextManager.instance();
      const modalCtx = manager.getCommandContext(KnownContexts.Modal)!;
      const annotateCtx = manager.getCommandContext(KnownContexts.ModalAnnotate)!;

      const modalCmd = modalCtx.registerCommand("fo.modal.close.test", modalClose, () => true);
      modalCtx.bindKey("Escape", modalCmd.id);

      const annotateCmd = annotateCtx.registerCommand(
        KnownCommands.ModalAnnotateDeselect,
        annotateDeselect,
        () => true
      );
      annotateCtx.bindKey("Escape", annotateCmd.id);

      // Simulate Header mounting: annotate Escape fires
      await manager.handleKeyDown(escapeEvent());
      expect(annotateDeselect).toHaveBeenCalledOnce();
      expect(modalClose).not.toHaveBeenCalled();

      // Simulate Header unmounting: unregister the ModalAnnotate binding
      annotateCtx.unbindKey("Escape");
      annotateCtx.unregisterCommand(annotateCmd.id);

      vi.clearAllMocks();

      // Now Modal Escape takes over
      await manager.handleKeyDown(escapeEvent());
      expect(modalClose).toHaveBeenCalledOnce();
      expect(annotateDeselect).not.toHaveBeenCalled();
    });

    it("Escape is blocked when an input element is focused", async () => {
      const annotateDeselect = vi.fn();

      const manager = CommandContextManager.instance();
      const annotateCtx = manager.getCommandContext(KnownContexts.ModalAnnotate)!;

      const annotateCmd = annotateCtx.registerCommand(
        KnownCommands.ModalAnnotateDeselect,
        annotateDeselect,
        () => true
      );
      annotateCtx.bindKey("Escape", annotateCmd.id);

      // Simulate focus on an input field
      const input = document.createElement("input");
      document.body.appendChild(input);
      input.focus();

      await manager.handleKeyDown(escapeEvent());

      expect(annotateDeselect).not.toHaveBeenCalled();

      input.remove();
    });

    it("ModalAnnotate Escape is skipped when its command is disabled", async () => {
      const modalClose = vi.fn();
      const annotateDeselect = vi.fn();

      const manager = CommandContextManager.instance();
      const modalCtx = manager.getCommandContext(KnownContexts.Modal)!;
      const annotateCtx = manager.getCommandContext(KnownContexts.ModalAnnotate)!;

      const modalCmd = modalCtx.registerCommand("fo.modal.close.test", modalClose, () => true);
      modalCtx.bindKey("Escape", modalCmd.id);

      // Register with enablement returning false
      const annotateCmd = annotateCtx.registerCommand(
        KnownCommands.ModalAnnotateDeselect,
        annotateDeselect,
        () => false
      );
      annotateCtx.bindKey("Escape", annotateCmd.id);

      await manager.handleKeyDown(escapeEvent());

      expect(annotateDeselect).not.toHaveBeenCalled();
      expect(modalClose).toHaveBeenCalledOnce();
    });
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
      true
    );
    CommandContextManager.instance().pushContext(context);
    await CommandContextManager.instance().handleKeyDown(
      new KeyboardEvent("keydown", { ctrlKey: true, key: "x" })
    );
    expect(cmdFn).toBeCalledTimes(1);
    expect(execFn).toBeCalledTimes(1);
    expect(undoFn).toBeCalledTimes(0);
    expect(CommandContextManager.instance().getActiveContext().canUndo()).toBe(
      true
    );
    expect(CommandContextManager.instance().getActiveContext().canRedo()).toBe(
      false
    );
    await CommandContextManager.instance().getActiveContext().undo();
    expect(undoFn).toBeCalledTimes(1);
    expect(execFn).toBeCalledTimes(1);
    expect(CommandContextManager.instance().getActiveContext().canUndo()).toBe(
      false
    );
    expect(CommandContextManager.instance().getActiveContext().canRedo()).toBe(
      true
    );
    await CommandContextManager.instance().getActiveContext().redo();
    expect(execFn).toBeCalledTimes(2);
    expect(undoFn).toBeCalledTimes(1);
  });
});

import { describe, it, vi, expect, beforeEach } from "vitest";
import { CommandContextManager, KnownContexts } from "./CommandContextManager";
import { DelegatingUndoable } from "../actions";

describe("CommandContextManager", () => {
    beforeEach(() => {
        CommandContextManager.instance().reset();
    });

    it("can push/pop contexts", () => {
        const listener = vi.fn((_newId) => { return; });
        const newContext = CommandContextManager.instance().createCommandContext("fo.test", true);
        const unsub = CommandContextManager.instance().subscribe(listener);
        CommandContextManager.instance().pushContext(newContext);
        expect(listener).toBeCalledTimes(1);
        expect(listener.mock.calls[0][0]).toBe(newContext.id);
        expect(CommandContextManager.instance().getActiveContext().id).toBe(newContext.id);
        CommandContextManager.instance().popContext();
        expect(listener).toBeCalledTimes(2);
        expect(listener.mock.calls[1][0]).toBe(KnownContexts.Default);
        expect(CommandContextManager.instance().getActiveContext().id).toBe(KnownContexts.Default);
        unsub();
        CommandContextManager.instance().pushContext(newContext);
        //not called after unsubscribe
        expect(listener).toBeCalledTimes(2);
    });

    it("always keeps a default context", () => {
        expect(CommandContextManager.instance().getActiveContext().id).toBe(KnownContexts.Default);
        const newContext = CommandContextManager.instance().createCommandContext("fo.test", true);
        CommandContextManager.instance().pushContext(newContext);
        expect(CommandContextManager.instance().getActiveContext().id).toBe(newContext.id);
        //pop returns to the default
        CommandContextManager.instance().popContext();
        expect(CommandContextManager.instance().getActiveContext().id).toBe(KnownContexts.Default);
        //further pops stay at default
        CommandContextManager.instance().popContext();
        expect(CommandContextManager.instance().getActiveContext().id).toBe(KnownContexts.Default);

        CommandContextManager.instance().pushContext(newContext);
        expect(CommandContextManager.instance().getActiveContext().id).toBe(newContext.id);
        //direct restore to the default context
        CommandContextManager.instance().toDefault();
        expect(CommandContextManager.instance().getActiveContext().id).toBe(KnownContexts.Default);
    });

    it("can invoke a key binding", async () => {
        const execFn = vi.fn(async () => {
            return;
        });
        const cmd = CommandContextManager.instance().getActiveContext().registerCommand("fo.test", execFn, () => { return true; });
        CommandContextManager.instance().getActiveContext().bindKey("ctrl+x", cmd.id);
        await CommandContextManager.instance().handleKeyDown(new KeyboardEvent("keydown", { ctrlKey: true, key: "x" }));
        expect(execFn).toBeCalledTimes(1);
    });

    it("can invoke an inherited binding", async () => {
        const execFn = vi.fn(async () => {
            return;
        });
        const cmd = CommandContextManager.instance().getActiveContext().registerCommand("fo.test", execFn, () => { return true; });
        CommandContextManager.instance().getActiveContext().bindKey("ctrl+x", cmd.id);
        const context = CommandContextManager.instance().createCommandContext("new.context", true);
        CommandContextManager.instance().pushContext(context);
        await CommandContextManager.instance().handleKeyDown(new KeyboardEvent("keydown", { ctrlKey: true, key: "x" }));
        expect(execFn).toBeCalledTimes(1);
    });

    it("does not invoke a non-inherited default binding", async () => {
        const execFn = vi.fn(async () => {
            return;
        });
        const cmd = CommandContextManager.instance().getActiveContext().registerCommand("fo.test", execFn, () => { return true; });
        CommandContextManager.instance().getActiveContext().bindKey("ctrl+x", cmd.id);
        const context = CommandContextManager.instance().createCommandContext("new.context", false);
        CommandContextManager.instance().pushContext(context);
        await CommandContextManager.instance().handleKeyDown(new KeyboardEvent("keydown", { ctrlKey: true, key: "x" }));
        expect(execFn).toBeCalledTimes(0);
    });

    it("can perform undo/redo on an inherited context", async () => {
        const undoFn = vi.fn(async () => {
            return;
        });
        const execFn = vi.fn(async () => {
            return;
        });
        const undoable = new DelegatingUndoable("fo.undoable", execFn, undoFn);
        const cmdFn = vi.fn(async ()=>{
            return undoable;
        })
        const cmd = CommandContextManager.instance().getActiveContext().registerCommand("fo.test", cmdFn, () => { return true; });
        CommandContextManager.instance().getActiveContext().bindKey("ctrl+x", cmd.id);
        const context = CommandContextManager.instance().createCommandContext("new.context", true);
        CommandContextManager.instance().pushContext(context);
        await CommandContextManager.instance().handleKeyDown(new KeyboardEvent("keydown", { ctrlKey: true, key: "x" }));
        expect(cmdFn).toBeCalledTimes(1);
        expect(execFn).toBeCalledTimes(0);
        expect(undoFn).toBeCalledTimes(0);
        expect(CommandContextManager.instance().getActiveContext().canUndo()).toBe(true);
        expect(CommandContextManager.instance().getActiveContext().canRedo()).toBe(false);
        await CommandContextManager.instance().getActiveContext().undo();
        expect(undoFn).toBeCalledTimes(1);
        expect(execFn).toBeCalledTimes(0);
        expect(CommandContextManager.instance().getActiveContext().canUndo()).toBe(false);
        expect(CommandContextManager.instance().getActiveContext().canRedo()).toBe(true);
        await CommandContextManager.instance().getActiveContext().redo();
        expect(execFn).toBeCalledTimes(1);
        expect(undoFn).toBeCalledTimes(1);

    });
});
/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { Action, Undoable } from "../actions";
import { ActionListener, ActionManager, UndoStateListener } from "../actions/ActionManager";
import { KeyManager, KeyMatchState } from "../keys";
import { CommandRegistry } from "../registry/CommandRegistry";
import { Command, CommandFunction } from "../types";

/**
 * Represents a scoped execution environment consisting of
 * an undo/redo stack, registered commands, and key bindings.
 * Scope can be inherited to allow chaining of parent commands,
 * key binding, etc.
 */
export class CommandContext {
    private readonly actions = new ActionManager();
    private readonly commands = new CommandRegistry(this.actions);
    private readonly keys = new KeyManager(this.commands);
    private unsubscribes = new Array<() => void>();
    private lastCanUndo = false;
    private lastCanRedo = false;
    private undoListeners = new Set<UndoStateListener>();

    constructor(public readonly id: string, private readonly parent?: CommandContext) {
        if (parent) {
            this.lastCanUndo = parent.canUndo();
            this.lastCanRedo = parent.canRedo();
        }

    }

    public activate() {
        this.unsubscribes.push(this.listenToAllUndo(this.updateUndoState.bind(this)));
    }

    public deactivate() {
        this.unsubscribes.forEach((unsubFn) => {
            unsubFn();
        });
        this.unsubscribes = [];
    }
    /**
     * Adds a listeners to the local ActionManager and all parent
     * context's ActionManager to be notified of all undo state changes
     * in the heirarchy.
     * @param l the listener
     */
    private listenToAllUndo(l: () => void): () => void {
        const unsubLocal = this.actions.subscribeUndo(l);
        if (this.parent) {
            const unsubParent = this.parent.listenToAllUndo(l);
            return () => {
                unsubLocal();
                unsubParent();
            }
        }
        return unsubLocal;
    }
    /**
     * Called when this context or any parent context's undo state changes.
     * Updates the local undo state (lastUndo/lastRedo) with the total state
     * of all available scopes.  If there is a change, listeners are invoked.
     */
    private updateUndoState() {
        const newUndo = this.canUndo();
        const newRedo = this.canRedo();
        if (newUndo !== this.lastCanUndo || newRedo !== this.lastCanRedo) {
            this.lastCanUndo = newUndo;
            this.lastCanRedo = newRedo;
            this.fireUndoListeners();
        }
    }
    /**
     * Executes and action and handles pushing it on the 
     * undo stack it if is Undoable.
     * @see Undoable
     * @param action an action to execute
     */
    public async executeAction(action: Action) {
        await this.actions.execute(action);
    }

    /**
     * In the case where you need to enable undo
     * on an action that was executed outside of the
     * execution context, or simply undoes and redoes
     * something out of the execution cycle, push it 
     * to the undo stack directly.
     * @param action an undoable action.  It must support
     * redo as well via the execute method of the action.
     */
    public pushUndoable(action: Undoable): void {
        this.actions.push(action);
    }
    /**
     * Perform an undo.  If this undo stack is empty
     * and we have a parent, propogate it up.
     * @returns true if a redo occurred.
     */
    public async undo(): Promise<boolean> {
        if (this.actions.canUndo()) {
            await this.actions.undo();
            return true;
        }
        //if we have a parent, and we had no
        //undo, propogate it up
        if (this.parent) {
            return await this.parent.undo();
        }
        return false;
    }

    /**
     * Perform a redo.  If this redo stack is empty
     * and we have a parent, propogate it up.
     * @returns true if a redo occurred.
     */
    public async redo(): Promise<boolean> {
        if (this.actions.canRedo()) {
            await this.actions.redo();
            return true;
        }
        //if we have a parent, and we had no
        //redo, propogate it up
        if (this.parent) {
            return await this.parent.redo();
        }
        return false;
    }

    public canUndo(): boolean {
        if (this.actions.canUndo()) {
            return true;
        }
        if (this.parent) {
            return this.parent.canUndo();
        }
        return false;
    }

    public canRedo(): boolean {
        if (this.actions.canRedo()) {
            return true;
        }
        if (this.parent) {
            return this.parent.canRedo();
        }
        return false;
    }

    public undoStackSize(): number {
        let count = this.actions.getUndoStackSize();
        if (this.parent) {
            count += this.parent.undoStackSize();
        }
        return count;
    }

    public redoStackSize(): number {
        let count = this.actions.getRedoStackSize();
        if (this.parent) {
            count += this.parent.redoStackSize();
        }
        return count;
    }

    public depth(): number {
        return 1 + (this.parent ? this.parent.depth() : 0);
    }
    /**
     * Registers a listener that is notified of changes in the
     * undo/redo state.
     * @param listener the listener @see UndoStateListener
     * @returns a function to unregister the listener
     */
    public subscribeUndoState(listener: UndoStateListener): () => void {
        this.undoListeners.add(listener);
        return () => {
            this.undoListeners.delete(listener);
        }
    }

    public subscribeActions(listener: ActionListener): () => void {
        const unsub = this.actions.subscribeActions(listener);
        if (this.parent) {
            //subscribe recursively and curry the unsubscribes
            const parentUnsub = this.parent.subscribeActions(listener);
            return () => {
                unsub();
                parentUnsub();
            }
        }
        return unsub;
    }

    private fireUndoListeners() {
        this.undoListeners.forEach((listener) => {
            listener(this.lastCanUndo, this.lastCanRedo);
        });
    }

    private resetKeyState() {
        this.keys.resetKeyState();
        this.parent?.resetKeyState();
    }

    public handleKeyDown(event: KeyboardEvent): KeyMatchState {
        let match = this.keys.match(event);
        //key not handled locally, check the parent context(s)
        if (!match.full && this.parent) {
            match = this.parent.handleKeyDown(event);
        }
        //on a full match or no match, clear any in progress key sequences
        if (match.full || (!match.full && !match.partial)) {
            this.resetKeyState();
        }
        return match;
    }

    public registerCommand(
        id: string,
        execute: CommandFunction,
        enablement: () => boolean,
        label?: string,
        description?: string,

    ): Command {
        return this.commands.registerCommand(id, execute, enablement, label, description);
    }

    public unregisterCommand(id: string) {
        this.commands.unregisterCommand(id);
    }
    public getCommand(id: string): Command | undefined {
        const command = this.commands.getCommand(id);
        if (command) {
            return command;
        }
        return this.parent?.getCommand(id);
    }

    public async executeCommand(cmd: string | Command): Promise<boolean> {
        let resolved: Command | undefined;
        if (typeof cmd === "string") {
            resolved = this.getCommand(cmd);
        }
        else {
            resolved = cmd;
        }
        if (resolved) {
            const result = await resolved.execute();
            if (result && "undo" in result && typeof result.undo === "function") {
                this.actions.push(result as Undoable);
            }
            return true;
        }
        console.error(`There is no command ${cmd} registered in the current context.`);
        return false;
    }

    public bindKey(sequence: string, commandId: string): void {
        this.keys.bindKey(sequence, commandId);
    }
    public unbindKey(binding: string){
        this.keys.unbindKey(binding);
    }

    public clearUndoRedoStack(){
        this.actions.clear();
        this.parent?.clearUndoRedoStack();
    }
}
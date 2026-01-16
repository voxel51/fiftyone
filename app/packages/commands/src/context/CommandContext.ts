/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { Action, Undoable } from "../actions";
import {
  ActionListener,
  ActionManager,
  UndoStateListener,
} from "../actions/ActionManager";
import { KeyManager, KeyMatchState } from "../keys";
import { CommandRegistry } from "../registry/CommandRegistry";
import { Command, CommandFunction } from "../types";
import { isUndoable } from "../utils";

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

  /**
   * @param id The id of the context
   * @param parent An optional parent context to delegate
   * to if this context does not handle the command or
   * to chain the undo stacks.
   */
  constructor(
    public readonly id: string,
    private readonly parent?: CommandContext
  ) {
    if (parent) {
      this.lastCanUndo = parent.canUndo();
      this.lastCanRedo = parent.canRedo();
    }
  }

  /**
   * Marks the context as active, causing it to listen
   * to parent contexts.
   */
  public activate() {
    this.unsubscribes.push(
      this.listenToAllUndo(this.updateUndoState.bind(this))
    );
  }

  /**
   * Unsubribes all listeners registered in the @see this.activate
   * call.
   */
  public deactivate() {
    this.unsubscribes.forEach((unsubFn) => {
      unsubFn();
    });
    this.unsubscribes = [];
  }
  /**
   * Adds a listener to the local ActionManager and all parent
   * context's ActionManager to be notified of all undo state changes
   * in the heirarchy.
   * @param listener the listener
   */
  private listenToAllUndo(listener: () => void): () => void {
    const unsubLocal = this.actions.subscribeUndo(listener);
    if (this.parent) {
      const unsubParent = this.parent.listenToAllUndo(listener);
      return () => {
        unsubLocal();
        unsubParent();
      };
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
   * Executes an action and handles pushing it on the
   * undo stack if it is Undoable.
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
  public undo(): boolean {
    if (this.actions.canUndo()) {
      this.actions.undo();
      return true;
    }
    //if we have a parent, and we had no
    //undo, propogate it up
    if (this.parent) {
      return this.parent.undo();
    }
    return false;
  }

  /**
   * Perform a redo.  If this redo stack is empty
   * and we have a parent, propogate it up.
   * @returns true if a redo occurred.
   */
  public redo(): boolean {
    if (this.actions.canRedo()) {
      this.actions.redo();
      return true;
    }
    //if we have a parent, and we had no
    //redo, propogate it up
    if (this.parent) {
      return this.parent.redo();
    }
    return false;
  }
  /**
   * @returns true if there is an Unodable
   * operation on the stack.
   */
  public canUndo(): boolean {
    if (this.actions.canUndo()) {
      return true;
    }
    if (this.parent) {
      return this.parent.canUndo();
    }
    return false;
  }

  /**
   * @returns true if there is a redo operation
   * on the redo stack.
   */
  public canRedo(): boolean {
    if (this.actions.canRedo()) {
      return true;
    }
    if (this.parent) {
      return this.parent.canRedo();
    }
    return false;
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
    };
  }

  /**
   * Listens to action events in this and any parent
   * contexts.  This listener is notified of any Action
   * that is executed and whether it is an undo or not.
   * @param listener an ActionListener
   * @returns An unsubscribe method
   */
  public subscribeActions(listener: ActionListener): () => void {
    const unsub = this.actions.subscribeActions(listener);
    if (this.parent) {
      //subscribe recursively and curry the unsubscribes
      const parentUnsub = this.parent.subscribeActions(listener);
      return () => {
        unsub();
        parentUnsub();
      };
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

  /**
   * Only public for testing.
   * @param event the keydown event
   * @returns a state indicating the match result,
   * either partial, or a command that matched fully.
   */
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

  /**
   * Registers a new command in this context.
   * @param id the command if
   * @param execute A function to execute on invocation
   * @param enablement A functional predicate to determine
   * if the command is enabled or not
   * @param label Optional short label
   * @param description Optional long description
   * @returns the new command
   */
  public registerCommand(
    id: string,
    execute: CommandFunction,
    enablement: () => boolean,
    label?: string,
    description?: string
  ): Command {
    return this.commands.registerCommand(
      id,
      execute,
      enablement,
      label,
      description
    );
  }
  /**
   * Unregisters a previously registered command.  No-op if
   * it isn't registered.
   * @param id the id of a previously registered command
   */
  public unregisterCommand(id: string) {
    this.commands.unregisterCommand(id);
  }

  /**
   * Gets a command by id.
   * @param id the id of the command to get
   * @returns the command or undefined if it isn't found
   */
  public getCommand(id: string): Command | undefined {
    const command = this.commands.getCommand(id);
    if (command) {
      return command;
    }
    return this.parent?.getCommand(id);
  }

  /**
   * Executes a command by id or instance in this context.
   * If the command returns an action that is an instance of
   * @see Undoable, it is push on the undo stack.
   * @param cmd The command id or a command instance to run.
   * @returns true if the command was executed
   */
  public executeCommand(cmd: string | Command): boolean {
    let resolved: Command | undefined;
    if (typeof cmd === "string") {
      resolved = this.getCommand(cmd);
    } else {
      resolved = cmd;
    }
    if (resolved) {
      const result = resolved.execute();
      if (result && isUndoable(result)) {
        this.actions.push(result as Undoable);
      }
      return true;
    }
    console.error(
      `There is no command ${cmd} registered in the current context.`
    );
    return false;
  }

  /**
   * Binds a key sequence to a command for execution.
   * @param sequence A key sequence, ie. ctrl+s, alt+t, etc
   * @param commandId the id of a previously registered command
   */
  public bindKey(sequence: string, commandId: string): void {
    this.keys.bindKey(sequence, commandId);
  }

  /**
   * Unbinds a previously registered key binding.
   * @param binding the key sequence of the binding
   */
  public unbindKey(binding: string) {
    this.keys.unbindKey(binding);
  }

  /**
   * Clears all actions from the undo stack
   */
  public clearUndoRedoStack() {
    this.actions.clear();
    this.parent?.clearUndoRedoStack();
  }
}

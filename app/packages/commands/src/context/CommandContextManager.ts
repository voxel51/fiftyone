/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { Command } from "../types";
import { CommandContext } from "./CommandContext";

/**
 * Known contexts.  Add to these if you need
 * to share a context between components.
 */
export enum KnownContexts {
  Default = "fo.default",
  Modal = "fo.modal",
}

export enum KnownCommands {
  Undo = "fo.undo",
  Redo = "fo.redo",
  ModalSelect = "fo.modal.select",
  ModalSidebarToggle = "fo.modal.sidebar.toggle",
  ModalFullScreenToggle = "fo.modal.fullscreen.toggle",
  ModalClose = "fo.modal.close",
  ModalNextSample = "fo.modal.next.sample",
  ModalPreviousSample = "fo.modal.previous.sample",
}
//callback for context changes
export type CommandContextListener = (newId: string) => void;

/**
 * Manages a stack of contexts as was all created context.
 * Contexts consist of commands, keybindings and the undo stack.
 * This manager allows for creation and a push/pop mechanism
 * to activate/deactivate them.
 */
export class CommandContextManager {
  private defaultContext = new CommandContext(KnownContexts.Default);
  private contextStack = new Array<CommandContext>();
  private static _instance: CommandContextManager | undefined;
  private listeners = new Set<CommandContextListener>();
  private contexts = new Map<string, CommandContext>();

  constructor() {
    this.contextStack.push(this.defaultContext);
    if (document) {
      document.addEventListener("keydown", this.handleKeyDown.bind(this));
    }
    this.defaultContext.registerCommand(
      KnownCommands.Undo,
      () => {
        this.getActiveContext().undo();
      },
      () => {
        return this.getActiveContext().canUndo();
      },
      "Undo",
      "Undoes the previous command."
    );
    this.defaultContext.bindKey("ctrl+z", KnownCommands.Undo);
    this.defaultContext.bindKey("meta+z", KnownCommands.Undo);
    this.defaultContext.registerCommand(
      KnownCommands.Redo,
      () => {
        this.getActiveContext().redo();
      },
      () => {
        return this.getActiveContext().canRedo();
      },
      "Redo",
      "Redoes a previously undone command."
    );
    this.defaultContext.bindKey("ctrl+shift+z", KnownCommands.Redo);
    this.defaultContext.bindKey("meta+y", KnownCommands.Redo);
    this.defaultContext.bindKey("meta+shift+z", KnownCommands.Redo);
  }
  /**
   * @returns the single instance of this manager
   */
  public static instance(): CommandContextManager {
    if (!CommandContextManager._instance) {
      CommandContextManager._instance = new CommandContextManager();
    }
    return CommandContextManager._instance;
  }
  /**
   * Factory method for CommandContexts for easy inheriting of the current context.
   * @param id The id of the new context
   * @param inheritCurrent If true, the current context will serve as a parent, so
   * any commands not handled in the current context will propagate up to the parent,
   * it's parent if there is one, and so on.
   * @returns The new context.  This context is not active until it is pushed @see this.pushExecutionContext
   */
  public createCommandContext(
    id: string,
    inheritCurrent: boolean
  ): CommandContext {
    if (this.contexts.has(id)) {
      throw new Error(`The command context ${id} already exists.`);
    }
    const newContext = new CommandContext(
      id,
      inheritCurrent
        ? this.contextStack[this.contextStack.length - 1]
        : undefined
    );
    this.contexts.set(id, newContext);
    return newContext;
  }
  /**
   * Gets a previously created context by id.  @see this.createCommandContext
   * @param id the context id
   * @returns The context or undefined if it doesn't exist
   */
  public getCommandContext(id: string): CommandContext | undefined {
    return this.contexts.get(id);
  }

  /**
   * Removes a context from the list of known contexts.
   * @param id The context id
   */
  public deleteContext(id: string) {
    this.contexts.delete(id);
  }
  /**
   * Get the current command context
   * @returns the current command context
   */
  public getActiveContext(): CommandContext {
    return this.contextStack[this.contextStack.length - 1];
  }

  /**
   * Pushes a context on to the stack, making it the active context.
   * When it is no longer needed to be active, pop it. @see this.popExecutionContext
   * @param context The context to activate
   */
  public pushContext(context: CommandContext): void {
    this.contextStack.push(context);
    context.activate();
    this.fireListeners();
  }

  /**
   * Pops the current command context if it is not the
   * base context.  Will never result in no context being
   * available.
   */
  public popContext(expectedId?: string): void {
    //do not pop the base/default context
    if (this.contextStack.length > 1) {
      const popped = this.contextStack.pop();
      if (expectedId) {
        if (expectedId !== popped?.id) {
          console.warn(
            `The CommandContext that was popped was not the expected context: ${expectedId}`
          );
        }
      }
      popped?.deactivate();
      this.fireListeners();
    }
  }

  /**
   * clears all contexts except the default context
   */
  public toDefault(): void {
    let changed = false;
    while (this.contextStack.length > 1) {
      this.contextStack.pop()?.deactivate();
      changed = true;
    }
    if (changed) {
      this.fireListeners();
    }
  }

  /**
   * removes all contexts,listeners and creates a new default context.
   * THIS IS FOR TESTING
   */
  public reset(): void {
    this.defaultContext = new CommandContext(KnownContexts.Default);
    this.contextStack = [this.defaultContext];
    this.listeners.clear();
    this.contexts.clear();
  }

  /**
   * Executes a command in context.  If it is a string,
   * the command must be previously registered.
   * @param command The command or id
   */
  public executeCommand(command: string | Command) {
    this.getActiveContext().executeCommand(command);
  }

  /**
   * Subscribes to context change events.  Useful if you
   * have multiple contexts switching in the same component, ie. 2 editors
   * @param listener the listener
   * @returns The unsubscribe function
   */
  public subscribe(listener: CommandContextListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  /**
   * Fires any context listeners that are registered
   */
  private fireListeners() {
    this.listeners.forEach((listener) => {
      listener(this.contextStack[this.contextStack.length - 1].id);
    });
  }

  /**
   * Handles the keydown event.  Only public for testing.
   * @param event the key event
   * @returns Nothing
   */
  public async handleKeyDown(event: KeyboardEvent): Promise<void> {
    const active = document.activeElement;

    // Prevent shortcuts when interacting with any form field
    if (
      active?.tagName === "INPUT" ||
      active?.tagName === "TEXTAREA" ||
      active?.tagName === "SELECT" ||
      event.repeat
    ) {
      return;
    }
    const match = this.getActiveContext().handleKeyDown(event);
    if (match.full) {
      await this.getActiveContext().executeCommand(match.full);
      event.stopPropagation();
      event.preventDefault();
    }
  }
  /**
   * Clears the undo redo stack of the current context,
   * and parent(s) if it is inherited
   */
  public clearUndoRedoStack() {
    this.getActiveContext().clearUndoRedoStack();
  }
}

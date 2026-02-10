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
  ModalAnnotate = "fo.modal.annotate",
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
  ModalDeleteAnnotation = "fo.modal.delete.annotation",
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
  private static _instance: CommandContextManager | undefined;
  private listeners = new Set<CommandContextListener>();
  private contexts = new Map<string, CommandContext>();
  private activeContext: CommandContext;

  constructor() {
    this.activeContext = this.defaultContext;
    this.contexts.set(this.defaultContext.id, this.defaultContext);
    if (typeof document !== "undefined") {
      document.addEventListener("keydown", this.handleKeyDown.bind(this));
    }
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
    parentId: string,
    propagate: boolean
  ): CommandContext {
    if (this.contexts.has(id)) {
      throw new Error(`The command context ${id} already exists.`);
    }

    const parent: CommandContext | undefined = this.contexts.get(parentId);
    if (!parent) {
      throw new Error(`The parent command context ${parentId} does not exist.`);
    }
    const newContext = new CommandContext(id, parent, propagate);
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
    if (this.activeContext.id === id) {
      this.deactivateContext(id);
    }
    this.contexts.delete(id);
  }
  /**
   * Get the current command context
   * @returns the current command context
   */
  public getActiveContext(): CommandContext {
    return this.activeContext;
  }

  /**
   * Activates the given context.
   * @param id The id of the context to activate
   */
  public activateContext(id: string): void {
    const context = this.contexts.get(id);
    if (!context) {
      throw new Error(`The command context ${id} does not exist.`);
    }
    //Don't let parent contexts activate over their children
    //This is to prevent the parent from stealing focus from its children
    //during rerendering of the parent
    if (this.activeContext.isDescendantOf(context)) {
      return;
    }

    if (this.activeContext === context) {
      return;
    }
    this.activeContext.deactivate();
    this.activeContext = context;
    this.activeContext.activate();
    this.fireListeners();
  }

  /**
   * Deactivates the current command context if it is not the
   * base context.  Will never result in no context being
   * available.
   */
  public deactivateContext(expectedId?: string): void {
    if (expectedId && this.activeContext.id !== expectedId) {
      throw new Error(
        `The command context ${expectedId} does not match the active context ${this.activeContext.id}.`
      );
    }
    this.activeContext.deactivate();
    this.activeContext = this.activeContext.getParent() || this.defaultContext;
    this.activeContext.activate();
    this.fireListeners();
  }

  /**
   * clears all contexts except the default context
   */
  public toDefault(): void {
    if (this.activeContext.id === this.defaultContext.id) {
      return;
    }
    this.activeContext.deactivate();
    this.activeContext = this.defaultContext;
    this.activeContext.activate();
    this.fireListeners();
  }

  /**
   * removes all contexts,listeners and creates a new default context.
   * THIS IS FOR TESTING
   */
  public reset(): void {
    this.defaultContext = new CommandContext(KnownContexts.Default);
    this.activeContext = this.defaultContext;
    this.defaultContext.activate();
    this.listeners.clear();
    this.contexts.clear();
    this.contexts.set(this.defaultContext.id, this.defaultContext);
  }

  /**
   * Executes a command in context.  If it is a string,
   * the command must be previously registered.
   * @param command The command or id
   */
  public async executeCommand(command: string | Command) {
    await this.getActiveContext().executeCommand(command);
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
      listener(this.activeContext.id);
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
    const match = this.activeContext.handleKeyDown(event);
    if (match.full) {
      await this.activeContext.executeCommand(match.full);
      event.stopPropagation();
      event.preventDefault();
    }
  }
  /**
   * Clears the undo redo stack of the current context,
   * and parent(s) if it is inherited
   */
  public clearUndoRedoStack() {
    this.activeContext.clearUndoRedoStack();
  }
}

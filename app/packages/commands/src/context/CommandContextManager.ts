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
  ModalNextMediaField = "fo.modal.next.mediafield",
  ModalNextSample = "fo.modal.next.sample",
  ModalPreviousMediaField = "fo.modal.previous.mediafield",
  ModalPreviousSample = "fo.modal.previous.sample",
  ModalDeleteAnnotation = "fo.modal.delete.annotation",
}
//callback for context changes
export type CommandContextListener = (newId: string) => void;

/**
 * Manages a fixed chain of command contexts: [default, modal, modalAnnotate].
 * Contexts consist of commands, keybindings and the undo stack.
 * Key matching walks the stack from top to bottom, first match wins.
 *
 * TODO: This is a duct-tape simplification. The stack is hardcoded.
 * Refactor to support dynamic context management properly.
 */
export class CommandContextManager {
  private defaultContext = new CommandContext(KnownContexts.Default);
  // TODO: hardcoded modal context chain — refactor to be dynamic
  private modalContext = new CommandContext(
    KnownContexts.Modal,
    this.defaultContext
  );
  // TODO: hardcoded modalAnnotate context chain — refactor to be dynamic
  private modalAnnotateContext = new CommandContext(
    KnownContexts.ModalAnnotate,
    this.modalContext
  );

  // TODO: hardcoded fixed stack order — refactor to be dynamic
  private contextStack: CommandContext[] = [
    this.defaultContext,
    this.modalContext,
    this.modalAnnotateContext,
  ];

  private static _instance: CommandContextManager | undefined;
  private listeners = new Set<CommandContextListener>();
  private contexts = new Map<string, CommandContext>();

  constructor() {
    if (document) {
      document.addEventListener("keydown", this.handleKeyDown.bind(this));
    }

    // Register all hardcoded contexts in the lookup map
    this.contexts.set(KnownContexts.Default, this.defaultContext);
    this.contexts.set(KnownContexts.Modal, this.modalContext);
    this.contexts.set(KnownContexts.ModalAnnotate, this.modalAnnotateContext);

    this.defaultContext.registerCommand(
      KnownCommands.Undo,
      async () => {
        await this.getActiveContext().undo();
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
      async () => {
        await this.getActiveContext().redo();
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

    // activate all contexts
    for (const ctx of this.contextStack) {
      ctx.activate();
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
   * TODO: duct-tape — createCommandContext is kept for API compat but
   * returns existing context if it matches a known ID. Refactor later.
   */
  public createCommandContext(
    id: string,
    _inheritCurrent: boolean
  ): CommandContext {
    const existing = this.contexts.get(id);
    if (existing) {
      return existing;
    }
    // For unknown contexts, create and register but don't add to stack
    const newContext = new CommandContext(id);
    this.contexts.set(id, newContext);
    return newContext;
  }
  /**
   * Gets a previously created context by id.
   * @param id the context id
   * @returns The context or undefined if it doesn't exist
   */
  public getCommandContext(id: string): CommandContext | undefined {
    return this.contexts.get(id);
  }

  /**
   * TODO: duct-tape no-op — stack is fixed. Refactor later.
   */
  public deleteContext(_id: string) {
    // no-op: stack is fixed
  }
  /**
   * Get the current command context (top of fixed stack)
   * @returns the current command context
   */
  public getActiveContext(): CommandContext {
    return this.contextStack[this.contextStack.length - 1];
  }

  /**
   * TODO: duct-tape no-op — stack is fixed. Refactor later.
   */
  public pushContext(_context: CommandContext): void {
    // no-op: stack is fixed
  }

  /**
   * TODO: duct-tape no-op — stack is fixed. Refactor later.
   */
  public popContext(_expectedId?: string): void {
    // no-op: stack is fixed
  }

  /**
   * TODO: duct-tape no-op — stack is fixed. Refactor later.
   */
  public toDefault(): void {
    // no-op: stack is fixed
  }

  /**
   * removes all contexts,listeners and creates a new default context.
   * THIS IS FOR TESTING
   */
  public reset(): void {
    this.defaultContext = new CommandContext(KnownContexts.Default);
    this.modalContext = new CommandContext(
      KnownContexts.Modal,
      this.defaultContext
    );
    this.modalAnnotateContext = new CommandContext(
      KnownContexts.ModalAnnotate,
      this.modalContext
    );
    this.contextStack = [
      this.defaultContext,
      this.modalContext,
      this.modalAnnotateContext,
    ];
    this.listeners.clear();
    this.contexts.clear();
    this.contexts.set(KnownContexts.Default, this.defaultContext);
    this.contexts.set(KnownContexts.Modal, this.modalContext);
    this.contexts.set(KnownContexts.ModalAnnotate, this.modalAnnotateContext);

    for (const ctx of this.contextStack) {
      ctx.activate();
    }
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
   * Subscribes to context change events.
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
   * TODO: currently unused because stack is fixed — will be needed after refactor
   */
  private _fireListeners() {
    this.listeners.forEach((listener) => {
      listener(this.contextStack[this.contextStack.length - 1].id);
    });
  }

  /**
   * Handles the keydown event.  Only public for testing.
   * Walks the fixed stack from top to bottom, first full match wins.
   * @param event the key event
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

    // Try to match key with all contexts starting from top of stack
    for (let i = this.contextStack.length - 1; i >= 0; i--) {
      const context = this.contextStack[i];
      const match = context.handleKeyDown(event);
      if (match.full) {
        await context.executeCommand(match.full);
        event.stopPropagation();
        event.preventDefault();
        return;
      }
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

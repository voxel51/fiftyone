/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { Command } from "../types";
import { CommandContext } from "./CommandContext";

export enum KnownContexts {
    Default = "fo.default"
}
//callback for context changes
export type CommandContextListener = (newId: string) => void;

export class CommandContextManager {

    private defaultContext = new CommandContext(KnownContexts.Default);
    private contextStack = new Array<CommandContext>();
    private static _instance: CommandContextManager | undefined;
    private listeners = new Set<CommandContextListener>();
    constructor() {
        this.contextStack.push(this.defaultContext);
        if(document){
            document.addEventListener("keydown", this.handleKeyDown);
        }
    }

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
    public createCommandContext(id: string, inheritCurrent: boolean = true): CommandContext {
        const newContext = new CommandContext(id, inheritCurrent ? this.contextStack[this.contextStack.length - 1] : undefined);
        return newContext;
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
        this.fireListeners();
    }

    /**
     * Pops the current command context if it is not the 
     * base context.  Will never result in no context being
     * available.
     */
    public popContext(): void {
        //do not pop the base/default context
        if (this.contextStack.length > 1) {
            this.contextStack.pop();
            this.fireListeners();
        }
    }

    /**
     * clears all contexts except the default context
     */
    public toDefault(): void {
        let changed = false;
        while (this.contextStack.length > 1) {
            this.contextStack.pop();
            changed = true;
        }
        if(changed){
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
    }

    public async executeCommand(command: string | Command){
        if(typeof command === "string"){
            
        }
    }
    public subscribe(listener: CommandContextListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        }
    }

    private fireListeners() {
        this.listeners.forEach((listener) => {
            listener(this.contextStack[this.contextStack.length - 1].id);
        });
    }

    public async handleKeyDown(event: KeyboardEvent){
        const match = this.getActiveContext().handleKeyDown(event);
        if(match.full){
            await this.getActiveContext().executeCommand(match.full);
        }
    }
}
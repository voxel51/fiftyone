/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { Action } from "../actions";

export type CommandFunction = ()=> Promise<Action | void | undefined>;

/**
 * Class to handle command style invocation.  It delegates
 * execution, undo, and enablement to lambdas vs a subclass
 * approach.
 * Commands are registered in to the CommandRegistry for
 * access from children, and unregistered on unmount.
 */
export class Command {
  //The current enabled state based on last evaluation
  //Used to notify listeners on a change.
  private _enabled = false;
  private enablementListeners = new Set<() => void>();
  constructor(
    public readonly id: string,
    private readonly executeFunc: CommandFunction,
    private enablementFunc: () => boolean,
    public readonly label?: string,
    public readonly description?: string,
  ) {
    //We don't fire listeners for initial
    //enablement, assuming the call is in process
    //of creating it and its local state is enough
    this._enabled = this.enablementFunc();
  }

  /**
   * Executes the executeFunc for this command.
   */
  public async execute(): Promise<Action | undefined | void> {
    if (!this.enablementFunc()) {
      return;
    }
    return await this.executeFunc();
  }

  /**
   * Evaluates the enablement function and returns the result.
   */
  public isEnabled(): boolean {
    const newEnabled = this.enablementFunc();
    if(newEnabled != this._enabled){
      this._enabled = newEnabled;
      this.fireListeners();
    }
    return this._enabled;
  }

  /**
   * Replaces the current enablement function and update the enablement
   * @param func 
   */
  public setEnablement(func: () => boolean) {
    this.enablementFunc = func;
    if (this._enabled !== this.enablementFunc()) {
      this._enabled = !this._enabled;
      this.fireListeners();
    }
  }

  private fireListeners(): void {
    this.enablementListeners.forEach((listener) => { listener() });
  }
  /**
   * Subscribes to changes in the enabled state
   * @param listener callback
   * @returns A callback to unsubscribe
   */
  public subscribe(listener: () => void): () => void {
    this.enablementListeners.add(listener);
    return () => {
      this.enablementListeners.delete(listener);
    }
  }
}

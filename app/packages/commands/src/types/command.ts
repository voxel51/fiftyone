/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

/**
 * Class to handle command style invocation.  It delegates
 * execution, undo, and enablement to lambdas vs a subclass
 * approach.
 * Commands are registered in to the CommandRegistry for
 * access from children, and unregistered on unmount.
 */
export class Command {
  //The current enabled state based on last evaluation
  private _enabled = false;
  private enablementListeners = new Set<() => void>();
  constructor(
    public readonly id: string,
    private readonly executeFunc: () => Promise<void>,
    private enablementFunc: () => boolean,
    private readonly undoFunc?: () => Promise<void>,
    public readonly label?: string,
    public readonly description?: string
  ) {
    //We don't fire listeners for initial
    //enablement, assuming the call is in process
    //of creating it and its local state is enough
    this._enabled = this.enablementFunc();
  }

  private canUndo(): boolean {
    return this.undoFunc !== undefined;
  }
  /**
   * Executes the executeFunc for this command.
   */
  public async execute(): Promise<void> {
    if (!this.enablementFunc()) {
      return;
    }
    await this.executeFunc();
    if (this.canUndo()) {
      //TODO: UndoManager
    }
  }
  /**
   * Undo, should only be called from UndoManager
   */
  public async undo(): Promise<void> {
    if (this.undoFunc !== undefined) {
      await this.undoFunc();
    }
  }

  /**
   * Evaluates the enablement function and returns the result.
   */
  public isEnabled(): boolean {
    return this.enablementFunc();
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

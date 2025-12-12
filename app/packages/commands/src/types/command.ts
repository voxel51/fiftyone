/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

/**
 * Class to handle command style invocation.  It deletegates
 * execution, undo, and enablement to lambdas vs a subclass
 * approach.
 * Commands are registered in to the CommandRegistry for
 * access from children, and unregistered on unmount.
 */
export class Command {
  public enabled: boolean;
  constructor(
    public readonly id: string,
    private readonly executeFunc: () => Promise<void>,
    private readonly enablementFunc?: () => boolean,
    private readonly undoFunc?: () => Promise<void>,
    public readonly label?: string,
    public readonly description?: string
  ) {
    if (enablementFunc) {
      this.enabled = enablementFunc();
    } else {
      this.enabled = true;
    }
  }

  private canUndo(): boolean {
    return this.undoFunc !== undefined;
  }
  /**
   * Executes the executeFunc for this command.
   */
  public async execute(): Promise<void> {
    if (this.enablementFunc) {
      if (!this.enablementFunc()) {
        return;
      }
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
   * Updates the enabled state.  If the command has an enablement function, isEnabled is
   * ignored, and the enablementFunc is reevaluted.
   * If isEnabled is not passed and there is no enablementFunc, the current enabled state
   * is returned.
   * @param isEnabled Optional value new value for enabled
   * @returns The enabled state
   */
  public updateEnabled(isEnabled?: boolean): boolean {
    if (this.enablementFunc) {
      this.enabled = this.enablementFunc();
      return this.enabled;
    }
    if (isEnabled) {
      this.enabled = isEnabled;
    }
    return this.enabled;
  }
}

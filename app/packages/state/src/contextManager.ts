type Callback = () => void;

type CallbackConfig = {
  callback: Callback;
  persistent?: boolean;
  greedy?: boolean;
};

export interface ContextManager {
  /**
   * Enter the context, triggering all registered enter callbacks.
   */
  enter(): void;

  /**
   * Exit the context, triggering all registered exit callbacks.
   */
  exit(): void;

  /**
   * Register a callback to be invoked on context {@link enter}.
   *
   * @param config Callback config
   *  - if greedy is true, callback will be given priority and prevent other callbacks from firing
   *  - if persistent is true, callback will not be removed after being invoked
   */
  registerEnterCallback(config: CallbackConfig): void;

  /**
   * Register a callback to be invoked on context {@link exit}.
   * @param config Callback config
   *  - if greedy is true, callback will be given priority and prevent other callbacks from firing
   *. - if persistent is true, callback will not be removed after being invoked
   */
  registerExitCallback(config: CallbackConfig): void;

  /**
   * Reset the context, clearing all registered callbacks.
   */
  reset(): void;
}

/**
 * A simple {@link ContextManager} implementation.
 */
export class DefaultContextManager implements ContextManager {
  private enterCallbacks: CallbackConfig[] = [];
  private exitCallbacks: CallbackConfig[] = [];

  enter(): void {
    this.executeCallbacks(this.enterCallbacks);
  }

  exit(): void {
    this.executeCallbacks(this.exitCallbacks);
  }

  registerEnterCallback(config: CallbackConfig): void {
    if (config.greedy) {
      this.enterCallbacks.unshift(config);
    } else {
      this.enterCallbacks.push(config);
    }
  }

  registerExitCallback(config: CallbackConfig): void {
    if (config.greedy) {
      this.exitCallbacks.unshift(config);
    } else {
      this.exitCallbacks.push(config);
    }
  }

  reset(): void {
    this.enterCallbacks = [];
    this.exitCallbacks = [];
  }

  /**
   * Execute a list of callbacks.
   *
   * The execution follows these rules:
   *  - Callbacks are executed serially in order of registration
   *  - Greedy callbacks are executed before non-greedy callbacks
   *  - Greedy callbacks halt the execution chain
   *  - Non-persistent callbacks are removed once called
   *
   * @param callbacks List of callbacks
   * @private
   */
  private executeCallbacks(callbacks: CallbackConfig[]): void {
    const configsToCull: CallbackConfig[] = [];

    for (const cfg of callbacks) {
      try {
        cfg.callback();

        // cull non-persistent callbacks
        if (!cfg.persistent) {
          configsToCull.push(cfg);
        }

        // stop the callback chain if greedy
        if (cfg.greedy) {
          break;
        }
      } catch (err) {
        console.error("Error calling callback", err);
      }
    }

    this.cull(configsToCull);
  }

  /**
   * Remove the provided configs from the internal callback arrays.
   *
   * @param configs Configs to remove
   * @private
   */
  private cull(configs: CallbackConfig[]): void {
    const configCmp = (a: CallbackConfig, b: CallbackConfig) =>
      a.callback === b.callback;

    for (const config of configs) {
      const cmpFn = (cfg: CallbackConfig) => configCmp(cfg, config);

      let index = this.enterCallbacks.findIndex(cmpFn);
      if (index >= 0) {
        this.enterCallbacks.splice(index, 1);
      }

      index = this.exitCallbacks.findIndex(cmpFn);
      if (index >= 0) {
        this.exitCallbacks.splice(index, 1);
      }
    }
  }
}

type TaskYieldMessagePort = Pick<
  MessagePort,
  "onmessage" | "postMessage" | "start"
> & {
  unref?: () => void;
};

interface TaskYieldEnvironment {
  readonly MessageChannel?: new () => {
    readonly port1: TaskYieldMessagePort;
    readonly port2: TaskYieldMessagePort;
  };
  readonly setTimeout: (callback: () => void, delayMs: number) => unknown;
}

type TaskYielder = () => Promise<void>;

let sharedTaskYielder: TaskYielder | undefined;

/**
 * Yields to the host task queue so worker messages and cancellation can run.
 * A microtask-only await is not an equivalent cancellation boundary.
 */
export function yieldToTask(): Promise<void> {
  sharedTaskYielder ??= createTaskYielder(defaultTaskYieldEnvironment());
  return sharedTaskYielder();
}

/** Creates one FIFO task yielder, with a timer fallback for older runtimes. */
export function createTaskYielder(
  environment: TaskYieldEnvironment,
): TaskYielder {
  if (!environment.MessageChannel) {
    return () =>
      new Promise((resolve) => {
        environment.setTimeout(resolve, 0);
      });
  }

  const channel = new environment.MessageChannel();
  const pending: Array<() => void> = [];
  channel.port1.onmessage = () => {
    pending.shift()?.();
  };
  channel.port1.start();
  // Node-backed tests otherwise keep the process alive. Browser MessagePorts
  // have no unref method, so this has no production effect.
  channel.port1.unref?.();
  channel.port2.unref?.();

  return () =>
    new Promise<void>((resolve) => {
      pending.push(resolve);
      try {
        channel.port2.postMessage(undefined);
      } catch (error) {
        const index = pending.lastIndexOf(resolve);
        if (index >= 0) {
          pending.splice(index, 1);
        }
        throw error;
      }
    });
}

function defaultTaskYieldEnvironment(): TaskYieldEnvironment {
  const MessageChannelConstructor = globalThis.MessageChannel;
  return {
    ...(typeof MessageChannelConstructor === "function"
      ? { MessageChannel: MessageChannelConstructor }
      : {}),
    setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  };
}

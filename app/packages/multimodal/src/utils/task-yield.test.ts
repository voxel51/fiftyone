import { describe, expect, it, vi } from "vitest";
import { createTaskYielder } from "./task-yield";

describe("createTaskYielder", () => {
  it("resumes concurrent yields in FIFO order through one message channel", async () => {
    const fallback = vi.fn();
    const channels: FakeMessageChannel[] = [];
    const yielder = createTaskYielder({
      MessageChannel: class extends FakeMessageChannel {
        constructor() {
          super();
          channels.push(this);
        }
      },
      setTimeout: fallback,
    });
    const resumed: number[] = [];

    await Promise.all([
      yielder().then(() => resumed.push(1)),
      yielder().then(() => resumed.push(2)),
      yielder().then(() => resumed.push(3)),
    ]);

    expect(channels).toHaveLength(1);
    expect(channels[0].port1.start).toHaveBeenCalledOnce();
    expect(resumed).toEqual([1, 2, 3]);
    expect(fallback).not.toHaveBeenCalled();
  });

  it("falls back to a zero-delay timer without MessageChannel", async () => {
    const calls: number[] = [];
    const yielder = createTaskYielder({
      setTimeout(callback, delayMs) {
        calls.push(delayMs);
        queueMicrotask(callback);
      },
    });

    await yielder();

    expect(calls).toEqual([0]);
  });

  it("rejects a yield whose message cannot be posted", async () => {
    const yielder = createTaskYielder({
      MessageChannel: class extends FakeMessageChannel {
        constructor() {
          super();
          this.port2.postMessage = () => {
            throw new Error("closed");
          };
        }
      },
      setTimeout: vi.fn(),
    });

    await expect(yielder()).rejects.toThrow("closed");
  });
});

class FakeMessagePort {
  onmessage: ((event: MessageEvent) => void) | null = null;
  readonly start = vi.fn();
  readonly unref = vi.fn();

  postMessage(message: unknown): void {
    void message;
  }
}

class FakeMessageChannel {
  readonly port1 = new FakeMessagePort();
  readonly port2 = new FakeMessagePort();

  constructor() {
    this.port2.postMessage = () => {
      setTimeout(() => this.port1.onmessage?.({} as MessageEvent), 0);
    };
  }
}

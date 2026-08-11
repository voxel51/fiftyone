import { describe, expect, it, vi } from "vitest";

import { createMcapWorkerSlotLifecycle } from "./worker-slot-lifecycle";

describe("MCAP worker slot lifecycle", () => {
  it("wires handlers before init and resets through one disposal path", () => {
    const worker = new MockWorker();
    const slot: { worker?: Worker } = {};
    const handleResponse =
      vi.fn<(response: { readonly ok: boolean }) => void>();
    const rejectAll = vi.fn<(reason: string) => void>();
    const lifecycle = createMcapWorkerSlotLifecycle({
      createWorker: () => worker as unknown as Worker,
      disposeRequest: { type: "dispose" },
      handleResponse: (_slot, response: { readonly ok: boolean }) =>
        handleResponse(response),
      rejectAll: (_slot, reason) => rejectAll(reason),
      startupErrorMessage: "startup failed",
      workerErrorMessage: "worker failed",
    });

    expect(lifecycle.workerForSlot(slot, { type: "init" })).toBe(worker);
    expect(worker.handlersWereReadyAtInit).toBe(true);
    worker.onmessage?.({ data: { ok: true } } as MessageEvent<{
      readonly ok: boolean;
    }>);
    expect(handleResponse).toHaveBeenCalledWith({ ok: true });

    lifecycle.resetSlot(slot, "reset");
    expect(worker.messages).toEqual([{ type: "init" }, { type: "dispose" }]);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(rejectAll).toHaveBeenCalledWith("reset");
    expect(slot.worker).toBeUndefined();
  });
});

class MockWorker {
  handlersWereReadyAtInit = false;
  messages: unknown[] = [];
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  postMessage = vi.fn((message: unknown) => {
    if ((message as { readonly type?: string }).type === "init") {
      this.handlersWereReadyAtInit =
        typeof this.onmessage === "function" &&
        typeof this.onerror === "function";
    }
    this.messages.push(message);
  });
  terminate = vi.fn();
}

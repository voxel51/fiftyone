import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWorker } from "./util";

class MockWorker extends EventTarget {
  postMessage = vi.fn();
}

describe("createWorker", () => {
  beforeEach(() => {
    vi.stubGlobal("Worker", MockWorker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("allows worker errors when no looker event dispatcher is provided", () => {
    const worker = createWorker();

    expect(() => worker.dispatchEvent(new Event("error"))).not.toThrow();
    expect(() =>
      worker.dispatchEvent(
        new MessageEvent("message", {
          data: { error: { cls: "Error", message: "worker failed" } },
        }),
      ),
    ).not.toThrow();
  });
});

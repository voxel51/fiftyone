import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const options = {
  activePaths: [],
  coloring: "blue",
  colorscale: [],
  customizeColorSetting: {},
  labelTagColors: {},
  schema: {},
  selectedLabelTags: [],
};

const sample1 = { a: 1, b: 2, c: 3 };

// dummy worker class to simulate worker behavior
const { DummyWorker } = vi.hoisted(() => {
  return {
    DummyWorker: class DummyWorker extends EventTarget {
      postMessage(args: any) {
        setTimeout(() => {
          for (const [key, value] of Object.entries(args.sample)) {
            args.sample[key] = `transformed-${value}`;
          }
          const event = new MessageEvent("message", {
            data: {
              sample: args.sample,
              coloring: args.options.coloring,
              uuid: args.uuid,
            },
          });
          this.dispatchEvent(event);
        }, 10);
      }

      addEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: any
      ): void {
        super.addEventListener(type, listener, options);
      }

      removeEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: any
      ): void {
        super.removeEventListener(type, listener, options);
      }
    },
  };
});

vi.mock("../util", () => {
  return {
    createWorker: vi.fn(() => new DummyWorker() as unknown as Worker),
  };
});

import {
  AsyncJobResolutionResult,
  AsyncLabelsRenderingManager,
  _internal_resetForTests,
} from "./async-labels-rendering-manager";

describe("AsyncLabelsRenderingManager", () => {
  let manager: AsyncLabelsRenderingManager;

  beforeEach(() => {
    _internal_resetForTests();
    manager = new AsyncLabelsRenderingManager();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should enqueue a new job and resolve with merged sample", async () => {
    const promise = manager.enqueueLabelPaintingJob({
      labels: ["a", "c"],
      options,
      sample: sample1,
    });

    const result: AsyncJobResolutionResult = await promise;
    expect(result.sample).toEqual({
      a: "transformed-1",
      c: "transformed-3",
      b: 2,
    });
    expect(result.coloring).toBe("blue");
  });

  it("isProcessing() should reflect jobs in the queue", async () => {
    expect(manager.isProcessing()).toBe(false);

    manager.enqueueLabelPaintingJob({
      labels: ["a"],
      options,
      sample: sample1,
    });
    expect(manager.isProcessing()).toBe(true);

    await new Promise((r) => setTimeout(r, 20));
    expect(manager.isProcessing()).toBe(false);
  });

  it("should handle worker errors", async () => {
    vi.spyOn(DummyWorker.prototype, "postMessage").mockImplementation(
      function () {
        setTimeout(() => {
          const errorEvent = new ErrorEvent("error", {
            message: "Test error",
          });
          this.dispatchEvent(errorEvent);
        }, 10);
      }
    );

    const promise = manager.enqueueLabelPaintingJob({
      labels: ["a"],
      options,
      sample: sample1,
    });

    await expect(promise).rejects.toThrow("Test error");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dummyLooker = {
  state: {
    options: {
      coloring: "blue",
      customizeColorSetting: {},
      colorscale: [],
      labelTagColors: {},
      selectedLabelTags: [],
      activePaths: [],
    },
    config: {
      sources: [],
      fieldSchema: {},
    },
  },
} as unknown as Lookers;

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
              coloring: args.coloring,
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

import { Lookers } from "@fiftyone/state";
import {
  AsyncJobResolutionResult,
  AsyncLabelsRenderingManager,
  _internal_resetForTests,
} from "./async-labels-rendering-manager";

describe("AsyncLabelsRenderingManager", () => {
  let manager: AsyncLabelsRenderingManager;

  beforeEach(() => {
    _internal_resetForTests();
    manager = new AsyncLabelsRenderingManager(dummyLooker);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should enqueue a new job and resolve with merged sample", async () => {
    const promise = manager.enqueueLabelPaintingJob({
      sample: sample1,
      labels: ["a", "c"],
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

    manager.enqueueLabelPaintingJob({ sample: sample1, labels: ["a"] });
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
      sample: sample1,
      labels: ["a"],
    });

    await expect(promise).rejects.toThrow("Test error");
  });
});

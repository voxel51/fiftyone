import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Simplified dummy worker -- only postMessage and terminate are used
// by frame-reader.ts; no EventTarget or listener overrides needed.
const { DummyWorker } = vi.hoisted(() => {
  return {
    DummyWorker: class DummyWorker {
      postMessage = vi.fn();
      terminate = vi.fn();
    },
  };
});

vi.mock("../util", () => {
  return {
    createWorker: vi.fn(() => new DummyWorker() as unknown as Worker),
  };
});

vi.mock("../overlays", () => {
  return {
    loadOverlays: vi.fn(() => []),
  };
});

vi.mock("./shared", () => {
  return {
    LookerUtils: {
      workerCallbacks: {},
    },
    withFrames: vi.fn((obj: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(obj).map(([k, v]) => ["frames." + k, v])
      )
    ),
  };
});

vi.mock("@fiftyone/utilities", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@fiftyone/utilities")>();
  return {
    ...actual,
    sizeBytesEstimate: vi.fn(() => 1),
  };
});

import { createWorker } from "../util";
import { acquireReader, clearReader, resetFrameStores } from "./frame-reader";

type AcquireReaderOptions = Parameters<typeof acquireReader>[0];

const createMockOptions = (
  overrides: Partial<AcquireReaderOptions> = {}
): AcquireReaderOptions => ({
  activePaths: [],
  addFrame: vi.fn(),
  addFrameBuffers: vi.fn(),
  coloring: {} as any,
  customizeColorSetting: [],
  dispatchEvent: vi.fn(),
  getCurrentFrame: () => 1,
  dataset: "test-dataset",
  frameNumber: 1,
  frameCount: 100,
  group: undefined,
  sampleId: "test-sample",
  schema: {} as any,
  update: vi.fn(),
  view: [],
  ...overrides,
});

/**
 * Simulates the worker sending a frameChunk response by invoking the
 * frameChunk listener registered via createWorker.
 */
const simulateFrameChunk = (
  frames: Array<{ frame_number: number }>,
  range: [number, number]
) => {
  const mockCreateWorker = vi.mocked(createWorker);
  const lastCall = mockCreateWorker.mock.calls.at(-1);
  if (!lastCall) {
    throw new Error("createWorker has not been called");
  }

  const listeners = lastCall[0];
  const workerInstance = mockCreateWorker.mock.results.at(-1)?.value;

  if (listeners?.frameChunk) {
    for (const callback of listeners.frameChunk) {
      callback(workerInstance, { frames, range });
    }
  }
};

describe("frame-reader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearReader();
    // module-level store persists across detach; reset so frames don't leak between tests
    resetFrameStores();
  });

  it("creates a worker via createWorker on acquireReader", () => {
    const options = createMockOptions();
    acquireReader(options);

    expect(createWorker).toHaveBeenCalledOnce();
  });

  it("sends setStream message to worker on acquireReader", () => {
    const options = createMockOptions({ frameNumber: 1, frameCount: 100 });
    acquireReader(options);

    const worker = vi.mocked(createWorker).mock.results[0].value;
    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "setStream",
        sampleId: "test-sample",
        frameNumber: 1,
        frameCount: 100,
      })
    );
  });

  it("continues existing stream when requesting a recently cached frame", () => {
    const options = createMockOptions();
    const requestFrames = acquireReader(options);

    // chunk callback sets requestingFrames = true (end < frameCount)
    simulateFrameChunk([{ frame_number: 1 }, { frame_number: 2 }], [1, 2]);

    const worker = vi.mocked(createWorker).mock.results[0].value;
    const callsBeforeRequest = worker.postMessage.mock.calls.length;

    // frame 1 is cached and a fetch is already in flight, so this is a no-op
    requestFrames(1);

    expect(createWorker).toHaveBeenCalledOnce();
    expect(worker.postMessage).toHaveBeenCalledTimes(callsBeforeRequest);
  });

  it("restarts the stream when requesting an uncached frame after stream completes", () => {
    const options = createMockOptions({ frameCount: 5 });
    const requestFrames = acquireReader(options);

    // short chunk ends the stream (nextRange null) but leaves frames 3-5 uncached
    simulateFrameChunk([{ frame_number: 1 }, { frame_number: 2 }], [1, 5]);

    requestFrames(4);

    // setStream terminates + recreates the worker for the uncached frame
    expect(createWorker).toHaveBeenCalledTimes(2);

    const secondWorker = vi.mocked(createWorker).mock.results[1].value;
    expect(secondWorker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "setStream",
        frameNumber: 4,
      })
    );
  });

  it("restarts the stream on cache miss when frame is behind the stream position", () => {
    // stream starts mid-video at frame 100, fetching forward
    const options = createMockOptions({ frameCount: 200, frameNumber: 100 });
    const requestFrames = acquireReader(options);

    // nextRange advances to [130, ...] after this chunk
    simulateFrameChunk(
      Array.from({ length: 30 }, (_, i) => ({ frame_number: i + 100 })),
      [100, 129]
    );

    // frame 50 is uncached and behind the stream position (scrub backward)
    requestFrames(50);

    expect(createWorker).toHaveBeenCalledTimes(2);

    const secondWorker = vi.mocked(createWorker).mock.results[1].value;
    expect(secondWorker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "setStream",
        frameNumber: 50,
      })
    );
  });

  it("does not restart stream on repeated cache-miss calls for the same frame", () => {
    const options = createMockOptions({ frameCount: 200, frameNumber: 100 });
    const requestFrames = acquireReader(options);

    simulateFrameChunk(
      Array.from({ length: 30 }, (_, i) => ({ frame_number: i + 100 })),
      [100, 129]
    );

    // first call restarts from frame 50 (behind stream position)
    requestFrames(50);
    expect(createWorker).toHaveBeenCalledTimes(2);

    const secondWorker = vi.mocked(createWorker).mock.results[1].value;
    const callsAfterRestart = secondWorker.postMessage.mock.calls.length;

    // second call before the worker responds: frame 50 is now being fetched, so no restart
    requestFrames(50);
    expect(createWorker).toHaveBeenCalledTimes(2);
    expect(secondWorker.postMessage).toHaveBeenCalledTimes(callsAfterRestart);
  });

  it("does not restart stream when requesting a frame from a larger cached batch", () => {
    const options = createMockOptions({ frameCount: 200 });
    const requestFrames = acquireReader(options);

    // chunk callback sets requestingFrames = true
    simulateFrameChunk(
      Array.from({ length: 30 }, (_, i) => ({ frame_number: i + 1 })),
      [1, 30]
    );

    const worker = vi.mocked(createWorker).mock.results[0].value;
    const callsBeforeRequest = worker.postMessage.mock.calls.length;

    // frame 15 is cached and a fetch is in flight, so this is a no-op
    requestFrames(15);

    expect(createWorker).toHaveBeenCalledOnce();
    expect(worker.postMessage).toHaveBeenCalledTimes(callsBeforeRequest);
  });

  it("calls addFrame for each frame in a chunk response", () => {
    const addFrame = vi.fn();
    const options = createMockOptions({ addFrame });
    acquireReader(options);

    simulateFrameChunk(
      [{ frame_number: 1 }, { frame_number: 2 }, { frame_number: 3 }],
      [1, 3]
    );

    expect(addFrame).toHaveBeenCalledTimes(3);
    expect(addFrame).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ sample: { frame_number: 1 } })
    );
    expect(addFrame).toHaveBeenCalledWith(
      2,
      expect.objectContaining({ sample: { frame_number: 2 } })
    );
    expect(addFrame).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ sample: { frame_number: 3 } })
    );
  });

  it("calls addFrameBuffers with the chunk range", () => {
    const addFrameBuffers = vi.fn();
    const options = createMockOptions({ addFrameBuffers });
    acquireReader(options);

    simulateFrameChunk([{ frame_number: 1 }], [1, 30]);

    expect(addFrameBuffers).toHaveBeenCalledWith([1, 30]);
  });

  it("dispatches buffering false after receiving a chunk", () => {
    const dispatchEvent = vi.fn();
    const update = vi.fn();
    const options = createMockOptions({ update, dispatchEvent });
    acquireReader(options);

    simulateFrameChunk([{ frame_number: 1 }], [1, 30]);

    expect(update).toHaveBeenCalledWith(expect.any(Function));

    const updateFn = update.mock.calls[0][0];
    const result = updateFn({ buffering: true });
    expect(result).toEqual({ buffering: false });
    expect(dispatchEvent).toHaveBeenCalledWith("buffering", false);

    // already non-buffering: should not dispatch again
    vi.clearAllMocks();
    const result2 = updateFn({ buffering: false });
    expect(result2).toEqual({ buffering: false });
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it("clearReader resets state and terminates worker", () => {
    const options = createMockOptions();
    acquireReader(options);

    const worker = vi.mocked(createWorker).mock.results[0].value;

    clearReader();

    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("replays frames cached by a prior reader into a re-acquired looker (modal reuse)", () => {
    // First looker (grid hover) streams frames into the persistent per-sample store.
    acquireReader(createMockOptions({ sampleId: "shared" }));
    simulateFrameChunk([{ frame_number: 1 }, { frame_number: 2 }], [1, 2]);

    // Detach must NOT wipe the store.
    clearReader();

    // Second looker (modal) over the same sample replays the cached frames
    // immediately — zero re-stream of already-buffered frames.
    const addFrame = vi.fn();
    const addFrameBuffers = vi.fn();
    acquireReader(
      createMockOptions({ sampleId: "shared", addFrame, addFrameBuffers })
    );

    expect(addFrame).toHaveBeenCalledWith(1, expect.anything());
    expect(addFrame).toHaveBeenCalledWith(2, expect.anything());
    expect(addFrameBuffers).toHaveBeenCalled();
  });
});

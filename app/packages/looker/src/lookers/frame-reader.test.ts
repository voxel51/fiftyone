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
    // the frame store is module-level + persistent across detach; reset it
    // between tests so cached frames don't replay into the next acquireReader.
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

    // Simulate a chunk response so nextRange is updated (stream is ongoing).
    // The frameChunk callback also sends requestFrameChunk internally
    // (because end < frameCount) and sets requestingFrames = true.
    simulateFrameChunk([{ frame_number: 1 }, { frame_number: 2 }], [1, 2]);

    const worker = vi.mocked(createWorker).mock.results[0].value;
    const callsBeforeRequest = worker.postMessage.mock.calls.length;

    // Request a frame that IS in the cache (frame 1 was loaded above).
    // Since requestingFrames is already true from the chunk callback,
    // no additional postMessage is sent (Path D: no-op).
    requestFrames(1);

    // No new worker created, and no additional postMessage sent
    expect(createWorker).toHaveBeenCalledOnce();
    expect(worker.postMessage).toHaveBeenCalledTimes(callsBeforeRequest);
  });

  it("restarts the stream when requesting an uncached frame after stream completes", () => {
    const options = createMockOptions({ frameCount: 5 });
    const requestFrames = acquireReader(options);

    // Load only frames 1-2 (a short chunk); nextRange becomes null when the
    // worker reports the stream ended, but frames 3-5 are NOT cached.
    simulateFrameChunk([{ frame_number: 1 }, { frame_number: 2 }], [1, 5]);

    // Requesting an UNCACHED frame must restart the stream via setStream.
    requestFrames(4);

    // A new worker should have been created (setStream terminates + recreates)
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
    // Start the stream at frame 100 to simulate a video that has been
    // playing for a while. The stream fetches forward from frame 100.
    const options = createMockOptions({ frameCount: 200, frameNumber: 100 });
    const requestFrames = acquireReader(options);

    // Load frames 100-129. After this, nextRange advances to [130, ...].
    simulateFrameChunk(
      Array.from({ length: 30 }, (_, i) => ({ frame_number: i + 100 })),
      [100, 129]
    );

    // Request frame 50 as it was never loaded and is behind the stream
    // position (50 < 130). This simulates the user scrubbing backward
    // to a region the stream has already passed.
    requestFrames(50);

    // Should restart the stream from frame 50
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
    // Start stream at frame 100, simulating a video mid-playback
    const options = createMockOptions({ frameCount: 200, frameNumber: 100 });
    const requestFrames = acquireReader(options);

    // Load frames 100-129. nextRange advances to [130, ...]
    simulateFrameChunk(
      Array.from({ length: 30 }, (_, i) => ({ frame_number: i + 100 })),
      [100, 129]
    );

    // First call: frame 50 is behind stream position (50 < 130),
    // triggers restart from frame 50
    requestFrames(50);
    expect(createWorker).toHaveBeenCalledTimes(2);

    // Capture the second worker's postMessage count after setStream
    const secondWorker = vi.mocked(createWorker).mock.results[1].value;
    const callsAfterRestart = secondWorker.postMessage.mock.calls.length;

    // Second call before worker responds: should NOT restart again.
    // setStream already reset nextRange to [50, ...], and 50 >= 50
    // means isBeingFetched is true. requestingFrames is also true,
    // so no postMessage is sent either (Path D: no-op).
    requestFrames(50);
    expect(createWorker).toHaveBeenCalledTimes(2);
    expect(secondWorker.postMessage).toHaveBeenCalledTimes(callsAfterRestart);
  });

  it("does not restart stream when requesting a frame from a larger cached batch", () => {
    const options = createMockOptions({ frameCount: 200 });
    const requestFrames = acquireReader(options);

    // Simulate loading frames 1-30. The chunk callback sends
    // requestFrameChunk internally and sets requestingFrames = true.
    simulateFrameChunk(
      Array.from({ length: 30 }, (_, i) => ({ frame_number: i + 1 })),
      [1, 30]
    );

    const worker = vi.mocked(createWorker).mock.results[0].value;
    const callsBeforeRequest = worker.postMessage.mock.calls.length;

    // Request a frame that IS in the cache (frame 15 was loaded).
    // requestingFrames is already true, so no postMessage (Path D: no-op).
    requestFrames(15);

    // No new worker, and no additional postMessage sent
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

    // Call the update function to verify it returns { buffering: false }
    // and dispatches the buffering event when state.buffering is true
    const updateFn = update.mock.calls[0][0];
    const result = updateFn({ buffering: true });
    expect(result).toEqual({ buffering: false });
    expect(dispatchEvent).toHaveBeenCalledWith("buffering", false);

    // Non-buffering state: dispatchEvent should NOT be called again
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

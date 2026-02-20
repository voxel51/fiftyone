import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// dummy worker class to simulate worker behavior
const { DummyWorker } = vi.hoisted(() => {
    return {
        DummyWorker: class DummyWorker extends EventTarget {
            postMessage = vi.fn();
            terminate = vi.fn();

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

vi.mock("@fiftyone/utilities", () => {
    return {
        sizeBytesEstimate: vi.fn(() => 1),
    };
});

import { createWorker } from "../util";
import { acquireReader, clearReader } from "./frame-reader";

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
    removeFrame: vi.fn(),
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

        // Simulate a chunk response so nextRange is updated (stream is ongoing)
        simulateFrameChunk(
            [{ frame_number: 1 }, { frame_number: 2 }],
            [1, 2]
        );

        // Request a frame that IS in the cache (frame 1 was loaded above).
        // Since the stream is active and the frame is cached, there is no
        // cache miss — the existing stream should continue without restart.
        requestFrames(1);

        // The requestFrames call should not create a new worker
        expect(createWorker).toHaveBeenCalledOnce();
    });

    it("restarts the stream when requestFrames is called after stream completes", () => {
        const options = createMockOptions({ frameCount: 2 });
        const requestFrames = acquireReader(options);

        // Simulate loading all frames (end >= frameCount sets nextRange to null)
        simulateFrameChunk(
            [{ frame_number: 1 }, { frame_number: 2 }],
            [1, 2]
        );

        // Stream is now complete (nextRange === null)
        // Request a frame — should restart the stream
        requestFrames(1);

        // A new worker should have been created (setStream terminates + recreates)
        expect(createWorker).toHaveBeenCalledTimes(2);
    });

    it("restarts the stream on cache miss for evicted frames", () => {
        const options = createMockOptions({ frameCount: 200 });
        const requestFrames = acquireReader(options);

        // Simulate loading a chunk of frames (stream still active, end < frameCount)
        simulateFrameChunk(
            Array.from({ length: 30 }, (_, i) => ({ frame_number: i + 1 })),
            [1, 30]
        );

        // The stream is still active (end < frameCount), nextRange is set
        // Request a frame that was NOT loaded (frame 50 was never added to cache)
        // This simulates a cache miss scenario
        requestFrames(50);

        // Because frame 50 is not in the cache, the fix should detect the cache
        // miss and restart the stream from frame 50
        expect(createWorker).toHaveBeenCalledTimes(2);

        const secondWorker = vi.mocked(createWorker).mock.results[1].value;
        expect(secondWorker.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                method: "setStream",
                frameNumber: 50,
            })
        );
    });

    it("does not restart stream when requesting a frame from a larger cached batch", () => {
        const options = createMockOptions({ frameCount: 200 });
        const requestFrames = acquireReader(options);

        // Simulate loading frames 1-30
        simulateFrameChunk(
            Array.from({ length: 30 }, (_, i) => ({ frame_number: i + 1 })),
            [1, 30]
        );

        // Request a frame that IS in the cache (frame 15 was loaded)
        requestFrames(15);

        // Should NOT restart the stream — only one createWorker call total
        expect(createWorker).toHaveBeenCalledOnce();
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
        const update = vi.fn();
        const options = createMockOptions({ update });
        acquireReader(options);

        simulateFrameChunk([{ frame_number: 1 }], [1, 30]);

        expect(update).toHaveBeenCalledWith(expect.any(Function));

        // Call the update function to verify it returns { buffering: false }
        const updateFn = update.mock.calls[0][0];
        const result = updateFn({ buffering: true });
        expect(result).toEqual({ buffering: false });
    });

    it("clearReader resets state and terminates worker", () => {
        const options = createMockOptions();
        acquireReader(options);

        const worker = vi.mocked(createWorker).mock.results[0].value;

        clearReader();

        expect(worker.terminate).toHaveBeenCalledOnce();
    });

    it("calls removeFrame callback when cache evicts a frame", () => {
        const removeFrame = vi.fn();
        const options = createMockOptions({ removeFrame, frameCount: 10000 });
        acquireReader(options);

        // Load enough frames to fill the cache and trigger eviction
        // MAX_FRAME_STREAM_SIZE is 5100, sizeCalculation returns 1 per frame
        const batchSize = 100;
        for (let batch = 0; batch < 52; batch++) {
            const start = batch * batchSize + 1;
            const end = start + batchSize - 1;
            const frames = Array.from({ length: batchSize }, (_, i) => ({
                frame_number: start + i,
            }));
            simulateFrameChunk(frames, [start, end]);
        }

        // After loading 5200 frames with max of 5100, eviction should have occurred
        expect(removeFrame).toHaveBeenCalled();
    });
});

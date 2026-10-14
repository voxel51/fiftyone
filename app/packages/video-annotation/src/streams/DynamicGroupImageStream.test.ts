import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DynamicGroupImageStream } from "./DynamicGroupImageStream";
import { MAX_FRAME_ATTEMPTS } from "./frameBitmapStream";

interface WorkerMessage {
  type: string;
  reqId?: number;
  request?: { frameNumber: number; numFrames: number };
}

/** Minimal Worker stub: records outbound messages, replays inbound ones. */
class FakeWorker {
  static instances: FakeWorker[] = [];
  listeners: Array<(e: { data: unknown }) => void> = [];
  posted: WorkerMessage[] = [];

  constructor() {
    FakeWorker.instances.push(this);
  }

  addEventListener(_type: string, cb: (e: { data: unknown }) => void) {
    this.listeners.push(cb);
  }

  removeEventListener(_type: string, cb: (e: { data: unknown }) => void) {
    this.listeners = this.listeners.filter((l) => l !== cb);
  }

  postMessage(msg: WorkerMessage) {
    this.posted.push(msg);
  }

  terminate() {}

  emit(data: unknown) {
    for (const l of this.listeners) {
      l({ data });
    }
  }
}

const fetchChunks = (w: FakeWorker) =>
  w.posted.filter((m) => m.type === "fetchChunk");

const makeStream = () =>
  new DynamicGroupImageStream({
    id: "test",
    sampleId: "s1",
    dataset: "d1",
    view: [],
    frameCount: 120,
    frameRate: 30,
    chunkSize: 4,
  });

beforeEach(() => {
  FakeWorker.instances = [];
  vi.stubGlobal("Worker", FakeWorker as unknown as typeof Worker);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DynamicGroupImageStream failed-frame handling", () => {
  /** Settle every frame of the one outstanding chunk without a bitmap. */
  const failOutstandingChunk = (worker: FakeWorker, attempt: number) => {
    const requests = fetchChunks(worker);
    expect(requests).toHaveLength(attempt);

    const { reqId, request } = requests[attempt - 1];
    worker.emit({
      type: "chunkDone",
      reqId,
      range: [
        request!.frameNumber,
        request!.frameNumber + request!.numFrames - 1,
      ],
    });
  };

  it("retries a frame that settles without a bitmap, then writes it off", () => {
    const stream = makeStream();
    const worker = FakeWorker.instances[0];

    // Every attempt but the last leaves the frame missing, so the engine's
    // next prefetch tick re-requests it.
    for (let attempt = 1; attempt < MAX_FRAME_ATTEMPTS; attempt++) {
      stream.prefetch([0, 0]);
      failOutstandingChunk(worker, attempt);
      expect(stream.bufferState(0)).toBe("missing");
    }

    // The last attempt turns it terminal: it reports ready (empty) so the
    // buffer barrier plays through it...
    stream.prefetch([0, 0]);
    failOutstandingChunk(worker, MAX_FRAME_ATTEMPTS);
    expect(stream.bufferState(0)).toBe("ready");

    // ...and re-prefetching the same range issues no further fetch.
    stream.prefetch([0, 0]);
    expect(fetchChunks(worker)).toHaveLength(MAX_FRAME_ATTEMPTS);

    stream.destroy();
  });
});

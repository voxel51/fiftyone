import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImaVidImageStream } from "./ImaVidImageStream";

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

const makeStream = (maxBytes?: number) =>
  new ImaVidImageStream({
    id: "test",
    sampleId: "s1",
    dataset: "d1",
    view: [],
    frameCount: 120,
    frameRate: 30,
    chunkSize: 4,
    maxBytes,
  });

/** Land one decoded frame so the cache learns the frame size. */
const landFrame = (
  worker: FakeWorker,
  reqId: number,
  frameNumber: number,
  size: number,
) =>
  worker.emit({
    type: "frameReady",
    reqId,
    frameNumber,
    bitmap: { close: vi.fn() },
    width: size,
    height: size,
    meta: { src: "f.png" },
  });

beforeEach(() => {
  FakeWorker.instances = [];
  vi.stubGlobal("Worker", FakeWorker as unknown as typeof Worker);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ImaVidImageStream failed-frame handling", () => {
  it("treats frames that settle without a bitmap as terminally ready and never re-requests them", () => {
    const stream = makeStream();
    const worker = FakeWorker.instances[0];

    // Engine nudges a missing frame → one chunk goes out.
    stream.prefetch([0, 0]);
    const requests = fetchChunks(worker);
    expect(requests).toHaveLength(1);

    const { reqId, request } = requests[0];

    // Chunk completes but no frame produced a bitmap (e.g. unresolvable
    // filepath) → every requested frame failed.
    worker.emit({
      type: "chunkDone",
      reqId,
      range: [
        request!.frameNumber,
        request!.frameNumber + request!.numFrames - 1,
      ],
    });

    // The frame reports ready (empty) so the buffer barrier plays through it...
    expect(stream.bufferState(0)).toBe("ready");

    // ...and re-prefetching the same range issues no further fetch.
    stream.prefetch([0, 0]);
    expect(fetchChunks(worker)).toHaveLength(1);

    stream.destroy();
  });
});

describe("ImaVidImageStream decode-ahead budget", () => {
  it("requests a full chunk until the frame size is known", () => {
    const stream = makeStream(160_000);
    const worker = FakeWorker.instances[0];

    stream.prefetch([0, 3]);
    expect(fetchChunks(worker)[0].request!.numFrames).toBe(4);

    stream.destroy();
  });

  it("stops decoding ahead of what the cache can hold", () => {
    // A 100x100 frame is 40_000 bytes, so this budget holds four; half of that
    // capacity is the forward budget, leaving room for frames behind.
    const stream = makeStream(160_000);
    const worker = FakeWorker.instances[0];

    // The first chunk lands in full, so nothing ahead is still in flight.
    stream.prefetch([0, 3]);
    const first = fetchChunks(worker)[0];
    for (let frame = 1; frame <= 4; frame++) {
      landFrame(worker, first.reqId!, frame, 100);
    }

    // Playhead at frame 5, asking for three seconds: the budget allows two
    // frames ahead, split across the chunks it keeps in flight, so the
    // request is for far less than the configured chunk.
    stream.prefetch([4 / 30, 3]);
    const second = fetchChunks(worker)[1];
    expect(second.request!.frameNumber).toBe(5);
    expect(second.request!.numFrames).toBe(1);

    stream.destroy();
  });

  it("keeps the full chunk when frames are small next to the budget", () => {
    const stream = makeStream(1e9);
    const worker = FakeWorker.instances[0];

    stream.prefetch([0, 3]);
    const first = fetchChunks(worker)[0];
    for (let frame = 1; frame <= 4; frame++) {
      landFrame(worker, first.reqId!, frame, 100);
    }

    stream.prefetch([4 / 30, 3]);
    expect(fetchChunks(worker)[1].request!.numFrames).toBe(4);

    stream.destroy();
  });
});

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

const makeStream = () =>
  new ImaVidImageStream({
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

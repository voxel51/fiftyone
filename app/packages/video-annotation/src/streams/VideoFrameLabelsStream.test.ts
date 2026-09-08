import { createStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveSyntheticId,
  VideoFrameLabelsStream,
} from "./VideoFrameLabelsStream";

/**
 * Stand-in for the shared mask bitmap cache, so gate tests drive readiness
 * directly instead of running real decodes.
 */
const maskCache = vi.hoisted(() => ({
  decoded: new Set<string>(),
  warmed: [] as string[],
  /** Outstanding borrow count per source, so tests can assert pinning. */
  refs: new Map<string, number>(),
  /** Sources whose decode should reject. */
  undecodable: new Set<string>(),

  has(source: string): boolean {
    return this.decoded.has(source);
  },
  isWarming(): boolean {
    return false;
  },
  acquire(source: string): { bitmap: unknown } | undefined {
    if (!this.decoded.has(source)) {
      return undefined;
    }

    this.refs.set(source, (this.refs.get(source) ?? 0) + 1);
    return { bitmap: source };
  },
  async acquireAsync(source: string): Promise<{ bitmap: unknown }> {
    this.warmed.push(source);

    if (this.undecodable.has(source)) {
      throw new Error(`undecodable: ${source}`);
    }

    this.decoded.add(source);
    this.refs.set(source, (this.refs.get(source) ?? 0) + 1);
    return { bitmap: source };
  },
  release(source: string): void {
    const refs = this.refs.get(source) ?? 0;

    if (refs <= 1) {
      this.refs.delete(source);
      return;
    }

    this.refs.set(source, refs - 1);
  },
  borrows(source: string): number {
    return this.refs.get(source) ?? 0;
  },
  /** Simulates eviction of anything not currently borrowed. */
  evictUnborrowed(): void {
    for (const source of [...this.decoded]) {
      if (!this.refs.has(source)) {
        this.decoded.delete(source);
      }
    }
  },
  reset(): void {
    this.decoded.clear();
    this.warmed = [];
    this.refs.clear();
    this.undecodable.clear();
  },
}));

vi.mock("@fiftyone/lighter", () => ({
  maskBitmapCache: maskCache,
  maskSourceOf: (mask?: unknown) => mask ?? undefined,
}));

function buildStream(): VideoFrameLabelsStream {
  return new VideoFrameLabelsStream({
    id: "test",
    sampleId: "s",
    dataset: "d",
    view: [],
    frameCount: 100,
    frameRate: 30,
  });
}

// Frame numbers are 1-indexed: frame N's start time is (N-1)/fps.
const timeOfFrame = (frame: number, fps: number): number => (frame - 1) / fps;

describe("VideoFrameLabelsStream fetched-empty", () => {
  it("bufferState returns 'ready' for frames in a fetched range with no cached doc", () => {
    const stream = buildStream();
    // @ts-expect-error — test-only: populate the private fetched-ranges list
    stream.fetchedRanges.push([1, 60]);
    expect(stream.bufferState(timeOfFrame(10, 30))).toBe("ready");
  });

  it("getValue returns an empty snapshot for frames in a fetched range with no cached doc", () => {
    const stream = buildStream();
    // @ts-expect-error - poke the private fetchedRanges to set up the test
    stream.fetchedRanges.push([1, 60]);
    expect(stream.getValue(timeOfFrame(10, 30))).toEqual({
      frameNumber: 10,
      detections: [],
    });
  });
});

describe("VideoFrameLabelsStream extractDetections", () => {
  it("defaults missing keyframe to false", () => {
    const stream = buildStream();
    // @ts-expect-error — test-only: populate the private cache
    stream.cache.set(10, {
      frame_number: 10,
      detections: {
        detections: [
          { _id: "a", label: "car", bounding_box: [0, 0, 0.1, 0.1] },
        ],
      },
    });

    const value = stream.getValue(timeOfFrame(10, 30));
    expect(value?.detections[0].keyframe).toBe(false);
    expect(value?.detections[0]).not.toHaveProperty("propagation");
  });
});

describe("resolveSyntheticId", () => {
  it("prefers instance._id over index and _id", () => {
    expect(
      resolveSyntheticId({
        instance: { _cls: "Instance", _id: "i1" },
        index: 3,
        _id: "d1",
      }),
    ).toBe("instance-i1");
  });

  it("falls back to track-${index} when there is no instance id", () => {
    expect(resolveSyntheticId({ index: 3, _id: "d1" })).toBe("track-3");
  });

  it("treats index 0 as a valid track id", () => {
    expect(resolveSyntheticId({ index: 0, _id: "d1" })).toBe("track-0");
  });

  it("falls back to _id (then id) for untracked detections", () => {
    expect(resolveSyntheticId({ _id: "d1" })).toBe("d1");
    expect(resolveSyntheticId({ id: "d2" })).toBe("d2");
  });

  it("returns null when no usable identifier is present", () => {
    expect(resolveSyntheticId({ label: "car" })).toBeNull();
  });
});

describe("VideoFrameLabelsStream onCommit", () => {
  /** Seed a frame document carrying one detection. */
  const seedFrame = (stream: VideoFrameLabelsStream, frame: number): void => {
    // @ts-expect-error — test-only: populate the private frame-doc cache
    stream.cache.set(frame, {
      frame_number: frame,
      detections: {
        detections: [{ _id: "a", bounding_box: [0, 0, 0.1, 0.1] }],
      },
    });
  };

  const published = (
    stream: VideoFrameLabelsStream,
    store: ReturnType<typeof createStore>,
  ): unknown =>
    // @ts-expect-error — test-only: read back through the protected accessor
    stream.readPublished(store);

  it("builds no snapshot on repeat commits within the same frame", () => {
    const stream = buildStream();
    const store = createStore();
    seedFrame(stream, 10);

    const getValue = vi.spyOn(stream, "getValue");

    stream.onCommit(timeOfFrame(10, 30), store);
    expect(getValue).toHaveBeenCalledTimes(1);

    // The engine commits several times per frame; extracting the frame's
    // detections again would throw the result away.
    stream.onCommit(timeOfFrame(10, 30) + 0.001, store);
    expect(getValue).toHaveBeenCalledTimes(1);
  });

  it("publishes again once the frame changes", () => {
    const stream = buildStream();
    const store = createStore();
    seedFrame(stream, 10);
    seedFrame(stream, 11);

    stream.onCommit(timeOfFrame(10, 30), store);
    stream.onCommit(timeOfFrame(11, 30), store);

    expect(published(stream, store)).toMatchObject({ frameNumber: 11 });
  });

  it("publishes null when a frame's document goes away", () => {
    const stream = buildStream();
    const store = createStore();
    seedFrame(stream, 10);

    stream.onCommit(timeOfFrame(10, 30), store);
    expect(published(stream, store)).toMatchObject({ frameNumber: 10 });

    // Same frame number, no longer available: the frame-dedupe must not swallow
    // this — overlays would keep drawing labels the stream no longer has.
    // @ts-expect-error — test-only: drop the private cache entry
    stream.cache.delete(10);

    stream.onCommit(timeOfFrame(10, 30), store);
    expect(published(stream, store)).toBeNull();
  });
});

describe("VideoFrameLabelsStream mask gate", () => {
  /** Seed a frame document carrying `masks` inline detection masks. */
  const seedFrame = (
    stream: VideoFrameLabelsStream,
    frame: number,
    masks: string[],
  ): void => {
    // @ts-expect-error — test-only: populate the private frame-doc cache
    stream.cache.set(frame, {
      frame_number: frame,
      detections: {
        detections: masks.map((mask, i) => ({
          _id: `d${i}`,
          bounding_box: [0, 0, 1, 1],
          mask,
        })),
      },
    });
  };

  /** Let the warm pass' `allSettled(...).then(...)` chain run to completion. */
  const flush = async (): Promise<void> => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  };

  beforeEach(() => {
    maskCache.reset();
  });

  it("reports 'missing' while a cached frame's masks are undecoded", () => {
    const stream = buildStream();
    seedFrame(stream, 10, ["mask-a"]);

    // The document has landed — pre-gate this was unconditionally "ready".
    expect(stream.bufferState(timeOfFrame(10, 30))).toBe("missing");
  });

  it("stays 'missing' until every mask on the frame is held", async () => {
    const stream = buildStream();
    seedFrame(stream, 10, ["mask-a", "mask-b"]);
    maskCache.decoded.add("mask-a");

    // Resident is not enough — a resident mask can still be evicted.
    expect(stream.bufferState(timeOfFrame(10, 30))).toBe("missing");

    stream.prefetch([timeOfFrame(10, 30), timeOfFrame(10, 30)]);
    await flush();

    expect(stream.bufferState(timeOfFrame(10, 30))).toBe("ready");
    expect(maskCache.borrows("mask-a")).toBe(1);
    expect(maskCache.borrows("mask-b")).toBe(1);
  });

  it("reports 'ready' for a frame carrying no masks", () => {
    const stream = buildStream();
    seedFrame(stream, 10, []);

    expect(stream.bufferState(timeOfFrame(10, 30))).toBe("ready");
  });

  it("prefetch decodes masks ahead of the playhead", async () => {
    const stream = buildStream();
    seedFrame(stream, 10, ["mask-a"]);
    seedFrame(stream, 11, ["mask-b"]);

    stream.prefetch([timeOfFrame(10, 30), timeOfFrame(11, 30)]);
    await flush();

    // Warms across the whole lookahead, not just the first missing frame.
    expect(maskCache.warmed).toEqual(["mask-a", "mask-b"]);
    expect(stream.bufferState(timeOfFrame(11, 30))).toBe("ready");
  });

  it("keeps a held frame ready across an eviction sweep", async () => {
    const stream = buildStream();
    seedFrame(stream, 10, ["mask-a"]);

    stream.prefetch([timeOfFrame(10, 30), timeOfFrame(10, 30)]);
    await flush();
    expect(stream.bufferState(timeOfFrame(10, 30))).toBe("ready");

    // The regression this replaces: a frame settled once stayed ready forever,
    // so a looping play-through advanced the clock against evicted masks. A
    // borrow is what makes readiness survive the sweep.
    maskCache.evictUnborrowed();

    expect(maskCache.has("mask-a")).toBe(true);
    expect(stream.bufferState(timeOfFrame(10, 30))).toBe("ready");
  });

  it("plays through a frame whose mask cannot be decoded", async () => {
    const stream = buildStream();
    seedFrame(stream, 10, ["mask-bad"]);
    maskCache.undecodable.add("mask-bad");

    stream.prefetch([timeOfFrame(10, 30), timeOfFrame(10, 30)]);
    await flush();

    // Never held, so without this escape hatch the clock would stall forever.
    expect(maskCache.borrows("mask-bad")).toBe(0);
    expect(stream.bufferState(timeOfFrame(10, 30))).toBe("ready");
  });

  it("releases masks the playhead has left behind", async () => {
    const stream = buildStream();
    seedFrame(stream, 10, ["mask-a"]);
    seedFrame(stream, 60, ["mask-far"]);

    stream.prefetch([timeOfFrame(10, 30), timeOfFrame(10, 30)]);
    await flush();
    expect(maskCache.borrows("mask-a")).toBe(1);

    // Playhead jumps well past the hold window.
    stream.prefetch([timeOfFrame(60, 30), timeOfFrame(60, 30)]);
    await flush();

    expect(maskCache.borrows("mask-a")).toBe(0);
    expect(maskCache.borrows("mask-far")).toBe(1);
    expect(stream.bufferState(timeOfFrame(10, 30))).toBe("missing");
  });

  it("dispose returns every held borrow", async () => {
    const stream = buildStream();
    seedFrame(stream, 10, ["mask-a", "mask-b"]);

    stream.prefetch([timeOfFrame(10, 30), timeOfFrame(10, 30)]);
    await flush();
    expect(maskCache.borrows("mask-a")).toBe(1);
    expect(maskCache.borrows("mask-b")).toBe(1);

    stream.dispose();

    expect(maskCache.borrows("mask-a")).toBe(0);
    expect(maskCache.borrows("mask-b")).toBe(0);
  });

  it("a warm pass resolving after dispose releases its borrows", async () => {
    const stream = buildStream();
    seedFrame(stream, 10, ["mask-a"]);

    stream.prefetch([timeOfFrame(10, 30), timeOfFrame(10, 30)]);
    // Dispose while the hold pass is still in flight — the unmount race.
    stream.dispose();
    await flush();

    expect(maskCache.borrows("mask-a")).toBe(0);
    expect(stream.bufferState(timeOfFrame(10, 30))).toBe("missing");
  });

  it("does not hold stale masks when the document is replaced mid-decode", async () => {
    const stream = buildStream();
    seedFrame(stream, 10, ["mask-a"]);

    stream.prefetch([timeOfFrame(10, 30), timeOfFrame(10, 30)]);

    // The chunk lands over the frame while the hold pass is still in flight.
    // @ts-expect-error — test-only: the invalidation a landed chunk performs
    stream.maskSourceCache.delete(10);
    // @ts-expect-error — test-only: the release path a landed chunk triggers
    stream.releaseMasksAt(10);
    seedFrame(stream, 10, ["mask-c"]);

    await flush();

    // Without source revalidation the pass holds mask-a and the frame reports
    // ready while mask-c is undecoded.
    expect(maskCache.borrows("mask-a")).toBe(0);
    expect(stream.bufferState(timeOfFrame(10, 30))).toBe("missing");
  });

  it("re-gates a frame whose document is replaced", async () => {
    const stream = buildStream();
    seedFrame(stream, 10, ["mask-a"]);

    stream.prefetch([timeOfFrame(10, 30), timeOfFrame(10, 30)]);
    await flush();
    expect(stream.bufferState(timeOfFrame(10, 30))).toBe("ready");

    // A replaced doc may carry different masks, so the frame must re-gate — and
    // the hold on the old masks has to come off.
    // @ts-expect-error — test-only: mimic a window chunk landing over the frame
    stream.maskSourceCache.delete(10);
    // @ts-expect-error — test-only: the release path a landed chunk triggers
    stream.releaseMasksAt(10);
    seedFrame(stream, 10, ["mask-c"]);

    expect(maskCache.borrows("mask-a")).toBe(0);
    expect(stream.bufferState(timeOfFrame(10, 30))).toBe("missing");
  });
});

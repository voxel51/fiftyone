import { describe, expect, it, vi } from "vitest";
import {
  resolveSyntheticId,
  VideoFrameLabelsStream,
} from "./VideoFrameLabelsStream";
import { getVideoLabelsWindow } from "../../../core/src/client/videoLabelsClient";

vi.mock("../../../core/src/client/videoLabelsClient", () => ({
  getVideoLabelsWindow: vi.fn(
    async (req: { startFrame: number; endFrame: number }) => ({
      frames: {},
      range: [req.startFrame, req.endFrame],
    }),
  ),
}));

const windowMock = vi.mocked(getVideoLabelsWindow);

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

describe("VideoFrameLabelsStream fetchRange", () => {
  const chunked = (chunkSize: number, frameCount = 100) =>
    new VideoFrameLabelsStream({
      id: "test",
      sampleId: "s",
      dataset: "d",
      view: [],
      frameCount,
      frameRate: 30,
      chunkSize,
    });

  // Chunk start frames of the calls made since `from`. Asserting on call-count
  // deltas keeps tests independent without `mockClear` between them — clearing
  // this async module mock spuriously re-invokes its implementation under
  // vitest.
  const startsSince = (from: number) =>
    windowMock.mock.calls
      .slice(from)
      .map((c) => c[0].startFrame)
      .sort((a, b) => a - b);

  it("fetches one chunk per chunk-sized stride across the range", async () => {
    const n = windowMock.mock.calls.length;
    await chunked(10).fetchRange(1, 25);
    // first-missing frames at 1, 11, 21 → three chunk fetches
    expect(startsSince(n)).toEqual([1, 11, 21]);
  });

  it("clamps the start to frame 1", async () => {
    const n = windowMock.mock.calls.length;
    await chunked(10).fetchRange(-5, 5);
    expect(startsSince(n)).toEqual([1]);
    expect(windowMock.mock.calls[n][0].endFrame).toBe(10);
  });

  it("clamps the end to the clip's frame count", async () => {
    const n = windowMock.mock.calls.length;
    await chunked(10, 100).fetchRange(95, 200);
    expect(startsSince(n)).toEqual([95]);
    expect(windowMock.mock.calls[n][0].endFrame).toBe(100);
  });

  it("skips frames already cached", async () => {
    const n = windowMock.mock.calls.length;
    const stream = chunked(10);
    for (let f = 1; f <= 10; f++) {
      // @ts-expect-error — test-only: pretend frames 1..10 are cached
      stream.cache.set(f, { frame_number: f });
    }

    await stream.fetchRange(1, 20);
    expect(startsSince(n)).toEqual([11]);
  });

  it("does not skip frames past an unaligned in-flight chunk", async () => {
    const n = windowMock.mock.calls.length;
    const stream = chunked(10, 100);

    // Start an unaligned chunk covering frames 6..15, then ask for 1..20.
    // The reused 6..15 promise only covers through 15, so the range walk must
    // still fetch the 16..20 tail rather than striding past it.
    // @ts-expect-error — test-only: drive the private chunk fetch
    void stream.fetchChunk(6);
    await stream.fetchRange(1, 20);

    // Chunks: the pre-existing 6..15, plus 1..10 and 16..20 from the range.
    expect(startsSince(n)).toEqual([1, 6, 16]);
  });

  it("is a no-op when the range is empty after clamping", async () => {
    const n = windowMock.mock.calls.length;
    await chunked(10).fetchRange(50, 40);
    expect(windowMock.mock.calls.length).toBe(n);
  });

  it("populates the cache from the fetched window", async () => {
    windowMock.mockResolvedValueOnce({
      frames: { 3: { detections: { detections: [] } } },
      range: [1, 10],
    } as never);

    const stream = chunked(10);
    await stream.fetchRange(1, 5);

    // Frame 3 landed in the cache → ready at its time.
    expect(stream.bufferState((3 - 1) / 30)).toBe("ready");
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

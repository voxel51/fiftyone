import { describe, expect, it } from "vitest";
import {
  resolveSyntheticId,
  VideoFrameLabelsStream,
} from "./VideoFrameLabelsStream";

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
  it("defaults missing keyframe to false and propagation to null", () => {
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
    expect(value?.detections[0].propagation).toBeNull();
  });
});

describe("resolveSyntheticId", () => {
  it("prefers instance._id over index and _id", () => {
    expect(
      resolveSyntheticId({
        instance: { _cls: "Instance", _id: "i1" },
        index: 3,
        _id: "d1",
      })
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

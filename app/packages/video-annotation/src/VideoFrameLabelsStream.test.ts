import { describe, expect, it } from "vitest";
import { VideoFrameLabelsStream } from "./VideoFrameLabelsStream";

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
    // @ts-expect-error
    stream.fetchedRanges.push([1, 60]);
    expect(stream.getValue(timeOfFrame(10, 30))).toEqual({
      frameNumber: 10,
      detections: [],
    });
  });
});

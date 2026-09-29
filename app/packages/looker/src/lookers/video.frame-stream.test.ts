import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFrameNumber } from "../elements/util";
import { acquireReader, clearReader } from "./frame-reader";
import { hasFrame } from "./utils";
import { VideoLooker } from "./video";

vi.mock("./frame-reader", () => ({
  acquireReader: vi.fn(() => vi.fn()),
  clearReader: vi.fn(),
}));

const FPS = 10;
const DURATION = 2;
const LAST = getFrameNumber(DURATION, DURATION, FPS);

const looker = (
  activePaths: string[],
  { thumbnail = true } = {},
): VideoLooker => {
  const instance: VideoLooker = Object.create(VideoLooker.prototype);
  Object.assign(instance, {
    dispatchEvent: vi.fn(),
    frames: new Map(),
    readingFrames: false,
    sampleOverlays: [],
    updater: vi.fn(),
    state: {
      buffering: false,
      buffers: [[1, 1]],
      config: {
        frameRate: FPS,
        sampleId: "sample",
        thumbnail,
      },
      duration: DURATION,
      frameNumber: 1,
      hovering: true,
      options: { activePaths },
      playing: true,
    },
  });
  return instance;
};

const pluck = (instance: VideoLooker) => instance.pluckOverlays(instance.state);

describe("VideoLooker frame stream", () => {
  beforeEach(() => {
    vi.mocked(acquireReader).mockClear();
    vi.mocked(clearReader).mockClear();
  });

  it("plays a thumbnail showing no frame field without streaming frames", () => {
    const tile = looker(["detections"]);
    pluck(tile);

    expect(acquireReader).not.toHaveBeenCalled();
    expect(tile.state.buffering).toBe(false);
    expect(hasFrame(tile.state.buffers, LAST)).toBe(true);
  });

  it("streams frames for a thumbnail showing a frame field", () => {
    pluck(looker(["frames.detections"]));

    expect(acquireReader).toHaveBeenCalledTimes(1);
  });

  it("starts streaming when a frame field is shown mid-playback", () => {
    const tile = looker([]);
    pluck(tile);
    tile.state.options.activePaths = ["frames.detections"];
    pluck(tile);

    expect(acquireReader).toHaveBeenCalledTimes(1);
    expect(hasFrame(tile.state.buffers, LAST)).toBe(false);
  });

  it("stops streaming when the last frame field is hidden mid-playback", () => {
    const tile = looker(["frames.detections"]);
    pluck(tile);
    tile.state.options.activePaths = [];
    pluck(tile);

    expect(clearReader).toHaveBeenCalledTimes(1);
    expect(hasFrame(tile.state.buffers, LAST)).toBe(true);
  });

  it("always streams frames outside a thumbnail", () => {
    pluck(looker([], { thumbnail: false }));

    expect(acquireReader).toHaveBeenCalledTimes(1);
  });
});

describe("VideoLooker frame labels", () => {
  it("has none for a frame the stream has not read", () => {
    expect(looker(["frames.detections"]).getCurrentFrameLabels()).toEqual([]);
  });
});

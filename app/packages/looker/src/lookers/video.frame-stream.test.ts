import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFrameNumber } from "../elements/util";
import { acquireReader } from "./frame-reader";
import { hasFrame } from "./utils";
import { VideoLooker } from "./video";

vi.mock("./frame-reader", () => ({
  acquireReader: vi.fn(() => vi.fn()),
  clearReader: vi.fn(),
}));

const FPS = 10;
const DURATION = 2;
const LAST = getFrameNumber(DURATION, DURATION, FPS);

type TestLooker = {
  state: {
    buffering: boolean;
    buffers: [number, number][];
    config: Record<string, unknown>;
    options: { activePaths: string[] };
  };
  pluckOverlays: (state: unknown) => unknown;
};

/** A hovered looker, with just the state `pluckOverlays` reads. */
const looker = (
  activePaths: string[],
  { thumbnail = true } = {},
): TestLooker => {
  const instance = Object.create(VideoLooker.prototype);
  Object.assign(instance, {
    dispatchEvent: vi.fn(),
    frames: new Map(),
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

const pluck = (instance: TestLooker) => instance.pluckOverlays(instance.state);

describe("VideoLooker frame stream", () => {
  beforeEach(() => {
    vi.mocked(acquireReader).mockClear();
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

  it("always streams frames outside a thumbnail", () => {
    pluck(looker([], { thumbnail: false }));

    expect(acquireReader).toHaveBeenCalledTimes(1);
  });
});

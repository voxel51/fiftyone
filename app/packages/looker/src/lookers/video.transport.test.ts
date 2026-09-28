import { describe, expect, it } from "vitest";
import { getFrameNumber } from "../elements/util";
import { VideoLooker } from "./video";

const FPS = 10;
const DURATION = 2;
const LAST = getFrameNumber(DURATION, DURATION, FPS);

type Update = Record<string, unknown>;

/** Run a transport method against `state` and return the update it asks for. */
const updateFrom = (
  method: (this: unknown, ...args: never[]) => void,
  state: Record<string, unknown>,
  ...args: unknown[]
): Update => {
  let update: Update = {};
  method.call(
    {
      updater: (fn: (s: typeof state) => Update) => {
        update = fn(state);
      },
    },
    ...(args as never[]),
  );
  return update;
};

const state = (over: Record<string, unknown> = {}) => ({
  playing: false,
  duration: DURATION,
  frameNumber: 5,
  lockedToSupport: false,
  config: { frameRate: FPS, support: [4, 8] },
  ...over,
});

describe("VideoLooker.play", () => {
  it("plays from the current frame", () => {
    expect(updateFrom(VideoLooker.prototype.play, state())).toEqual({
      playing: true,
    });
  });

  it("rewinds a finished clip to its first frame", () => {
    expect(
      updateFrom(VideoLooker.prototype.play, state({ frameNumber: LAST })),
    ).toEqual({ playing: true, frameNumber: 1 });
  });

  it("rewinds to the support start when locked to the support", () => {
    expect(
      updateFrom(
        VideoLooker.prototype.play,
        state({ frameNumber: 8, lockedToSupport: true }),
      ),
    ).toEqual({ playing: true, frameNumber: 4 });
  });

  it("does nothing while already playing", () => {
    expect(
      updateFrom(VideoLooker.prototype.play, state({ playing: true })),
    ).toEqual({});
  });
});

describe("VideoLooker.seekToFrame", () => {
  it("clamps to the clip", () => {
    expect(updateFrom(VideoLooker.prototype.seekToFrame, state(), 999)).toEqual(
      { frameNumber: LAST },
    );
  });

  it("clamps to the support when locked to it", () => {
    const locked = state({ lockedToSupport: true });

    expect(updateFrom(VideoLooker.prototype.seekToFrame, locked, 1)).toEqual({
      frameNumber: 4,
    });
    expect(updateFrom(VideoLooker.prototype.seekToFrame, locked, 20)).toEqual({
      frameNumber: 8,
    });
  });
});

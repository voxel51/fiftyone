import { afterEach, describe, expect, it, vi } from "vitest";
import { VideoElement } from "./video";

const FPS = 10;

type Update = (
  change: Record<string, unknown> | ((state: never) => Record<string, unknown>),
  post?: (state: never, overlays: never[]) => void,
) => void;

/**
 * Runs one of the element's event handlers against `initial`, applying its
 * updates the way the looker does, and returns every `frame` event it
 * dispatches.
 */
const framesFrom = (
  eventType: "play" | "seeked",
  initial: Record<string, unknown>,
  presentedSeconds: number[] = [],
): unknown[] => {
  let state: Record<string, unknown> = {
    config: { frameRate: FPS, support: null, thumbnail: true },
    duration: 10,
    lockedToSupport: false,
    options: { autoplay: false, loop: false },
    loaded: true,
    seeking: false,
    buffering: false,
    ...initial,
  };
  const frames: unknown[] = [];
  const update: Update = (change, post) => {
    const next = typeof change === "function" ? change(state as never) : change;
    state = { ...state, ...next };
    post?.(state as never, []);
  };
  const queue = [...presentedSeconds];
  const element = {
    frameNumber: 1,
    requestCallback: (callback: (time: number) => void) => {
      const time = queue.shift();
      if (time !== undefined) callback(time);
    },
  };
  const events = VideoElement.prototype.getEvents.call(element);
  events[eventType]?.({
    event: new Event(eventType) as never,
    update: update as never,
    dispatchEvent: (type: string, detail: unknown) => {
      if (type === "frame") frames.push(detail);
    },
  });
  return frames;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("VideoElement presented frames", () => {
  it("reports each frame the playback loop presents, read off the video's clock", () => {
    expect(framesFrom("play", { frameNumber: 1 }, [0.25, 0.35])).toEqual([
      { playing: true, timeSeconds: 0.25 },
      { playing: true, timeSeconds: 0.35 },
    ]);
  });

  it("reports where a completed seek landed", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
      callback();
      return 0;
    });

    expect(framesFrom("seeked", { frameNumber: 8, playing: true })).toEqual([
      { playing: true, timeSeconds: 0.75 },
    ]);
  });
});

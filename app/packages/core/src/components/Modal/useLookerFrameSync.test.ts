import { getTime } from "@fiftyone/looker";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLookerFrameSync } from "./useLookerFrameSync";

const seek = vi.fn();
vi.mock("@fiftyone/playback", () => ({ usePlayback: () => ({ seek }) }));

const FPS = 10;

const makeLooker = () => {
  const frameCallbacks: Array<() => void> = [];
  const loadCallbacks: Array<() => void> = [];
  const looker = {
    frameNumber: 1,
    state: { playing: false },
    seekToFrame: vi.fn((frame: number) => {
      looker.frameNumber = frame;
      frameCallbacks.forEach((cb) => cb());
    }),
    subscribeToState: (_field: string, cb: () => void) => {
      frameCallbacks.push(cb);
      return () => undefined;
    },
    addEventListener: (_event: string, cb: () => void) => {
      loadCallbacks.push(cb);
    },
    removeEventListener: vi.fn(),
    /** The looker moves to `frame` on its own, as its 0-9 keys do. */
    moveTo: (frame: number) => {
      looker.frameNumber = frame;
      frameCallbacks.forEach((cb) => cb());
    },
    load: () => loadCallbacks.forEach((cb) => cb()),
  };
  return looker;
};

const render = (looker: ReturnType<typeof makeLooker>) =>
  renderHook(() => useLookerFrameSync(looker as never, FPS)).result.current;

describe("useLookerFrameSync", () => {
  beforeEach(() => seek.mockClear());

  it("moves the playhead when the looker changes frame while paused", () => {
    const looker = makeLooker();
    render(looker);

    looker.moveTo(11);

    expect(seek).toHaveBeenCalledTimes(1);
    expect(seek).toHaveBeenCalledWith(getTime(11, FPS));
  });

  it("does not echo a seek the timeline asked for", () => {
    const looker = makeLooker();
    const seekLooker = render(looker);

    seekLooker(7);

    expect(looker.seekToFrame).toHaveBeenCalledWith(7);
    expect(seek).not.toHaveBeenCalled();
  });

  it("leaves the playhead to the clock source while playing", () => {
    const looker = makeLooker();
    render(looker);
    looker.state.playing = true;

    looker.moveTo(12);

    expect(seek).not.toHaveBeenCalled();
  });

  it("syncs a clip that opens on its support start", () => {
    const looker = makeLooker();
    render(looker);
    looker.frameNumber = 4;

    looker.load();

    expect(seek).toHaveBeenCalledWith(getTime(4, FPS));
  });
});

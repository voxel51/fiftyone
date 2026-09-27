import { describe, expect, it, vi } from "vitest";
import { VideoLooker } from "../lookers/video";
import { VideoElement } from "./video";

const idleState = (frameNumber: number) =>
  ({
    options: { loop: false, volume: 0, playbackRate: 1 },
    config: { frameRate: 10, thumbnail: true },
    frameNumber,
    seeking: false,
    playing: false,
    loaded: true,
    buffering: false,
    hovering: false,
    hasPoster: true,
    destroyed: false,
  }) as unknown as Parameters<VideoElement["renderSelf"]>[0];

describe("VideoElement.renderSelf", () => {
  it("draws an idle tile's poster whatever frame its playhead is on", () => {
    // An idle thumbnail holds no video, so drawing anything but the poster
    // hands the canvas a null image
    const canvas = document.createElement("canvas");
    const element = { element: null, canvas, posterFrame: 1 } as unknown as {
      imageSource: unknown;
    };

    VideoElement.prototype.renderSelf.call(element, idleState(7));

    expect(element.imageSource).toBe(canvas);
  });

  const liveElement = (readyState: number, posterSeconds: number | null) => {
    const canvas = document.createElement("canvas");
    const video = document.createElement("video");
    Object.defineProperty(video, "readyState", { value: readyState });
    Object.defineProperty(video, "paused", { value: true });
    return {
      element: video,
      canvas,
      posterFrame: 1,
      posterSeconds,
      frameNumber: 1,
      loop: false,
      playbackRate: 1,
      volume: 0,
    } as unknown as { imageSource: unknown; canvas: unknown; element: unknown };
  };

  const hoveredState = (frameNumber: number) =>
    ({ ...idleState(frameNumber), hovering: true }) as Parameters<
      VideoElement["renderSelf"]
    >[0];

  it.each([
    {
      name: "keeps the poster up while a hovered video has no frame to show",
      readyState: 1,
      frameNumber: 1492,
      shows: "canvas",
    },
    {
      // A looping hover comes back to frame 1, which the poster no longer
      // shows
      name: "does not show a poster moved to a match in place of the clip's start",
      readyState: 4,
      frameNumber: 1,
      shows: "element",
    },
  ] as const)("$name", ({ readyState, frameNumber, shows }) => {
    const element = liveElement(readyState, 60);

    VideoElement.prototype.renderSelf.call(element, hoveredState(frameNumber));

    expect(element.imageSource).toBe(element[shows]);
  });
});

describe("VideoElement hover playback", () => {
  const acquire = async (posterSeconds: number | null) => {
    const updates: Record<string, unknown>[] = [];
    const state = {
      waitingForVideo: false,
      error: false,
      duration: 100,
      frameNumber: 1,
      hovering: true,
      config: { frameRate: 10, thumbnail: true },
    };
    const element = {
      posterSeconds,
      src: "clip.mp4",
      waitingToRelease: false,
      attachEvents: vi.fn(),
      update(next: (s: typeof state) => Record<string, unknown>) {
        updates.push(next(state));
      },
    } as unknown as { release: () => void };

    (
      VideoElement.prototype as unknown as { acquireVideo: () => boolean }
    ).acquireVideo.call(element);
    await vi.waitFor(() => expect(updates).toHaveLength(2));
    element.release();

    return updates[1];
  };

  it.each([
    {
      name: "at the poster's moment when the poster shows a match",
      posterSeconds: 60,
      update: { frameNumber: 601 },
    },
    {
      name: "where the playhead is when the poster shows the start",
      posterSeconds: null,
      update: {},
    },
  ])("starts $name", async ({ posterSeconds, update }) => {
    expect(await acquire(posterSeconds)).toEqual(update);
  });
});

describe("VideoLooker.posterAt", () => {
  const lookerWith = (state: Record<string, unknown>) => {
    const posterAt = vi.fn();
    const looker = {
      state: {
        config: { thumbnail: true },
        loaded: true,
        hovering: false,
        playing: false,
        ...state,
      },
      lookerElement: { children: [{ posterAt }] },
    };
    return { looker, posterAt };
  };

  it("leaves the poster alone before the first poster has loaded", () => {
    const { looker, posterAt } = lookerWith({ loaded: false });

    VideoLooker.prototype.posterAt.call(looker, 3);

    expect(posterAt).not.toHaveBeenCalled();
  });

  // A selection can change while the tile is live; dropping it would leave
  // the poster, and the next hover, at the previous match
  it("redraws the poster at the time asked for while the clip plays on hover", () => {
    const { looker, posterAt } = lookerWith({ hovering: true, playing: true });

    VideoLooker.prototype.posterAt.call(looker, 3);

    expect(posterAt).toHaveBeenCalledWith(3);
  });
});

import { act, cleanup, renderHook } from "@testing-library/react";
import { useAtomValue } from "jotai";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { durationAtom } from "./atoms";
import { PlaybackProvider, usePlaybackStore } from "./PlaybackProvider";
import { useVideoStream } from "./use-video-stream";

interface FakeVideo {
  duration: number;
  buffered: TimeRanges;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  _fire(event: string): void;
}

function makeTimeRanges(ranges: Array<[number, number]>): TimeRanges {
  return {
    length: ranges.length,
    start: (i: number) => ranges[i][0],
    end: (i: number) => ranges[i][1],
  } as TimeRanges;
}

function makeVideo(initialDuration = NaN): FakeVideo {
  const listeners = new Map<string, EventListener[]>();
  return {
    duration: initialDuration,
    buffered: makeTimeRanges([]),
    addEventListener: vi.fn((event: string, fn: EventListener) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(fn);
    }),
    removeEventListener: vi.fn((event: string, fn: EventListener) => {
      const arr = listeners.get(event) ?? [];
      listeners.set(event, arr.filter((f) => f !== fn));
    }),
    _fire(event: string) {
      for (const fn of listeners.get(event) ?? []) fn(new Event(event));
    },
  };
}

function renderStream(
  video: FakeVideo | null,
  opts: { blocking?: boolean } = {}
) {
  const videoRef = {
    current: video,
  } as React.RefObject<HTMLVideoElement | null>;

  return renderHook(
    () => {
      const store = usePlaybackStore();
      useVideoStream("video-1", videoRef, opts);
      return { store, duration: useAtomValue(durationAtom, { store }) };
    },
    {
      wrapper: ({ children }) => (
        <PlaybackProvider duration={0} stepInterval={1 / 30}>
          {children}
        </PlaybackProvider>
      ),
    }
  );
}

describe("useVideoStream", () => {
  afterEach(() => cleanup());

  it("does not register a stream when the ref is null", () => {
    const { result } = renderStream(null);
    expect(result.current.duration).toBe(0);
  });

  it("does not register a stream when initial duration is NaN", () => {
    const { result } = renderStream(makeVideo(NaN));
    expect(result.current.duration).toBe(0);
  });

  it("registers the stream immediately when the video already has a finite duration", () => {
    const { result } = renderStream(makeVideo(10));
    expect(result.current.duration).toBe(10);
  });

  it("registers the stream after loadedmetadata fires with a finite duration", () => {
    const video = makeVideo(NaN);
    const { result } = renderStream(video);
    expect(result.current.duration).toBe(0);

    act(() => {
      video.duration = 20;
      video._fire("loadedmetadata");
    });

    expect(result.current.duration).toBe(20);
  });

  it("updates the stream duration when durationchange fires", () => {
    const video = makeVideo(10);
    const { result } = renderStream(video);
    expect(result.current.duration).toBe(10);

    act(() => {
      video.duration = 30;
      video._fire("durationchange");
    });

    expect(result.current.duration).toBe(30);
  });

  it("ignores an Infinity duration from loadedmetadata", () => {
    const video = makeVideo(NaN);
    const { result } = renderStream(video);

    act(() => {
      video.duration = Infinity;
      video._fire("loadedmetadata");
    });

    expect(result.current.duration).toBe(0);
  });

  it("ignores a negative duration from durationchange", () => {
    const video = makeVideo(NaN);
    const { result } = renderStream(video);

    act(() => {
      video.duration = -5;
      video._fire("durationchange");
    });

    expect(result.current.duration).toBe(0);
  });

  it("subscribes to loadedmetadata and durationchange on the video element", () => {
    const video = makeVideo(NaN);
    renderStream(video);
    expect(video.addEventListener).toHaveBeenCalledWith(
      "loadedmetadata",
      expect.any(Function)
    );
    expect(video.addEventListener).toHaveBeenCalledWith(
      "durationchange",
      expect.any(Function)
    );
  });

  it("removes both event listeners when unmounted", () => {
    const video = makeVideo(10);
    const { unmount } = renderStream(video);

    act(() => unmount());

    expect(video.removeEventListener).toHaveBeenCalledWith(
      "loadedmetadata",
      expect.any(Function)
    );
    expect(video.removeEventListener).toHaveBeenCalledWith(
      "durationchange",
      expect.any(Function)
    );
  });

  it("passes blocking:false to the registered stream", () => {
    // A non-blocking stream still contributes its duration to the engine.
    const video = makeVideo(5);
    const { result } = renderStream(video, { blocking: false });
    expect(result.current.duration).toBe(5);
  });
});

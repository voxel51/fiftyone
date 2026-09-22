import { act, cleanup, renderHook } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isPlayingAtom } from "./atoms";
import { PlaybackProvider, usePlaybackStore } from "./PlaybackProvider";
import {
  getAudioAvailable,
  getAudioTracks,
  getMasterMuted,
  setMasterMuted,
  setMasterVolume,
  setTrackMuted,
  setTrackVolume,
} from "./store-access";
import { useVideoElementAudio } from "./use-video-audio";

const HAVE_NOTHING = 0;
const HAVE_METADATA = 1;

/**
 * The element under test is the surface's real `<video>`, so the harness
 * hands the hook a controllable fake through the ref rather than stubbing a
 * constructor (mirrors useVideoSync's tests).
 */
interface FakeVideo {
  readyState: number;
  HAVE_METADATA: number;
  volume: number;
  muted: boolean;
  playbackRate: number;
  preservesPitch: boolean;
  addEventListener(type: string, fn: EventListener): void;
  removeEventListener(type: string, fn: EventListener): void;
  _fire(type: string): void;
  _listenerCount(type: string): number;
  mozHasAudio?: boolean;
}

function makeVideo(): FakeVideo {
  const listeners = new Map<string, EventListener[]>();
  const video: FakeVideo = {
    readyState: HAVE_NOTHING,
    HAVE_METADATA,
    volume: 1,
    muted: false,
    playbackRate: 1,
    preservesPitch: false,
    addEventListener: (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type)?.push(fn);
    },
    removeEventListener: (type, fn) => {
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter((f) => f !== fn),
      );
    },
    _fire: (type) => {
      for (const fn of [...(listeners.get(type) ?? [])]) fn(new Event(type));
    },
    _listenerCount: (type) => (listeners.get(type) ?? []).length,
  };
  return video;
}

describe("useVideoElementAudio", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  function renderAudio(
    video: FakeVideo | null,
    options: { enabled?: boolean; label?: string; hasAudio?: boolean } = {},
  ) {
    const videoRef = {
      current: video,
    } as unknown as React.RefObject<HTMLVideoElement | null>;

    return renderHook(
      () => {
        const store = usePlaybackStore();
        const { hasAudio } = useVideoElementAudio("video", videoRef, options);
        return { store, hasAudio };
      },
      {
        wrapper: ({ children }) => (
          <PlaybackProvider duration={10} stepInterval={1 / 30}>
            {children}
          </PlaybackProvider>
        ),
      },
    );
  }

  it("leaves the element alone and publishes nothing while disabled", () => {
    const video = makeVideo();
    const { result } = renderAudio(video, { enabled: false });

    expect(video._listenerCount("loadedmetadata")).toBe(0);
    expect(video.preservesPitch).toBe(false);
    // untouched: the surface's own attribute, not the mixer's, still decides
    expect(video.muted).toBe(false);
    expect(getAudioAvailable(result.current.store)).toBe("unavailable");
    expect(getAudioTracks(result.current.store)).toHaveLength(0);
  });

  it("publishes availability and a roster entry once metadata arrives", () => {
    const video = makeVideo();
    const { result } = renderAudio(video, { label: "Master" });

    expect(getAudioAvailable(result.current.store)).toBe("unavailable");
    expect(getAudioTracks(result.current.store)).toHaveLength(0);

    act(() => video._fire("loadedmetadata"));

    expect(getAudioAvailable(result.current.store)).toBe("available");
    expect(getAudioTracks(result.current.store)).toEqual([
      { id: "video", label: "Master", kind: "native-element" },
    ]);
  });

  it("picks up metadata the element already had before the effect ran", () => {
    const video = makeVideo();
    video.readyState = HAVE_METADATA;
    const { result } = renderAudio(video);

    // no `loadedmetadata` to wait for — a cached source is already past it
    expect(getAudioAvailable(result.current.store)).toBe("available");
  });

  it("stays unavailable on a demuxer verdict of no audio track", () => {
    const video = makeVideo();
    const { result } = renderAudio(video, { hasAudio: false });

    act(() => video._fire("loadedmetadata"));

    expect(getAudioAvailable(result.current.store)).toBe("unavailable");
    expect(getAudioTracks(result.current.store)).toHaveLength(0);
  });

  it("goes unavailable when the element itself reports no audio track", () => {
    const video = makeVideo();
    video.mozHasAudio = false;
    const { result } = renderAudio(video);

    act(() => video._fire("loadedmetadata"));
    act(() => video._fire("loadeddata"));

    expect(result.current.hasAudio).toBe(false);
    expect(getAudioAvailable(result.current.store)).toBe("unavailable");
  });

  it("prefers the caller's verdict over the element's sniffing", () => {
    const video = makeVideo();
    video.mozHasAudio = false;
    const { result } = renderAudio(video, { hasAudio: true });

    act(() => video._fire("loadedmetadata"));
    act(() => video._fire("loadeddata"));

    expect(result.current.hasAudio).toBe(true);
    expect(getAudioAvailable(result.current.store)).toBe("available");
  });

  it("starts the element muted so the autoplay policy is satisfied", () => {
    const video = makeVideo();
    const { result } = renderAudio(video);

    // the master mute's session default, applied to the element by this hook
    // — the surface must NOT hardcode a `muted` attribute
    expect(getMasterMuted(result.current.store)).toBe(true);
    expect(video.muted).toBe(true);
    expect(video.preservesPitch).toBe(true);
  });

  it("drives element mute from the master and per-track faders", () => {
    const video = makeVideo();
    const { result } = renderAudio(video);
    const { store } = result.current;

    act(() => setMasterMuted(store, false));
    expect(video.muted).toBe(false);

    act(() => setTrackMuted(store, "video", true));
    expect(video.muted).toBe(true);

    act(() => setTrackMuted(store, "video", false));
    expect(video.muted).toBe(false);

    act(() => setMasterMuted(store, true));
    expect(video.muted).toBe(true);
  });

  it("keeps .volume at the unmuted magnitude so unmuting is instant", () => {
    const video = makeVideo();
    const { result } = renderAudio(video);
    const { store } = result.current;

    act(() => {
      setMasterVolume(store, 0.5);
      setTrackVolume(store, "video", 0.4);
    });

    // muted (session default) — but the level is carried on `.volume`, and
    // silence is `.muted`'s job alone
    expect(video.muted).toBe(true);
    expect(video.volume).toBeCloseTo(0.2);

    act(() => setMasterMuted(store, false));
    expect(video.muted).toBe(false);
    expect(video.volume).toBeCloseTo(0.2);
  });

  it("unmutes on the first play when the viewer has expressed no preference", () => {
    const video = makeVideo();
    const { result } = renderAudio(video);
    const { store } = result.current;

    expect(video.muted).toBe(true);

    // the source has to be a real audio source first — see the gate below
    act(() => video._fire("loadedmetadata"));
    act(() => store.set(isPlayingAtom, true));

    expect(getMasterMuted(store)).toBe(false);
    expect(video.muted).toBe(false);
  });

  it("unmutes when play was pressed BEFORE metadata landed", () => {
    const video = makeVideo();
    const { result } = renderAudio(video);
    const { store } = result.current;

    // the order the app actually hits now that nothing blocks the barrier at
    // startup: play first, `loadedmetadata` after. Subscribing to
    // `isPlayingAtom` alone misses this, because it never changes again.
    act(() => store.set(isPlayingAtom, true));
    act(() => video._fire("loadedmetadata"));

    expect(getMasterMuted(store)).toBe(false);
    expect(video.muted).toBe(false);
  });

  it("does not spend the automatic unmute on a source with no audio", () => {
    const video = makeVideo();
    const { result } = renderAudio(video, { hasAudio: false });
    const { store } = result.current;

    act(() => video._fire("loadedmetadata"));
    act(() => store.set(isPlayingAtom, true));

    // master mute is global: unmuting here would hand the NEXT sample full
    // volume without the viewer ever unmuting something audible
    expect(getMasterMuted(store)).toBe(true);
  });

  it("never overrides a deliberate mute on play", () => {
    const video = makeVideo();
    const { result } = renderAudio(video);
    const { store } = result.current;

    act(() => video._fire("loadedmetadata"));
    // a viewer choice — writing the atom stores the key the session default
    // is defined by its absence
    act(() => setMasterMuted(store, true));

    act(() => store.set(isPlayingAtom, true));

    expect(getMasterMuted(store)).toBe(true);
    expect(video.muted).toBe(true);
  });

  it("invalidates metadata and the audio verdict when the source swaps", () => {
    const video = makeVideo();
    video.mozHasAudio = true;
    const { result } = renderAudio(video);
    const { store } = result.current;

    act(() => video._fire("loadedmetadata"));
    act(() => video._fire("loadeddata"));
    expect(getAudioAvailable(store)).toBe("available");
    expect(result.current.hasAudio).toBe(true);

    // the element is reused across samples; the previous file's answers say
    // nothing about the next one
    act(() => video._fire("loadstart"));

    expect(getAudioAvailable(store)).toBe("unavailable");
    expect(result.current.hasAudio).toBe(null);
    expect(getAudioTracks(store)).toHaveLength(0);

    act(() => video._fire("loadedmetadata"));
    expect(getAudioAvailable(store)).toBe("available");
  });

  it("tears its roster entry and listeners down on unmount", () => {
    const video = makeVideo();
    const { result, unmount } = renderAudio(video);
    const { store } = result.current;

    act(() => video._fire("loadedmetadata"));
    expect(getAudioTracks(store)).toHaveLength(1);

    unmount();

    expect(getAudioTracks(store)).toHaveLength(0);
    expect(getAudioAvailable(store)).toBe("unavailable");
    expect(video._listenerCount("loadedmetadata")).toBe(0);
    expect(video._listenerCount("loadstart")).toBe(0);
    expect(video._listenerCount("timeupdate")).toBe(0);
  });

  it("survives a null element", () => {
    const { result } = renderAudio(null);
    expect(getAudioAvailable(result.current.store)).toBe("unavailable");
    expect(result.current.hasAudio).toBe(null);
  });
});

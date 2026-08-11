import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_AUDIO_VOLUME,
  isBufferingAtom,
  isPlayingAtom,
  playheadAtom,
  seekEventAtom,
  speedAtom,
  streamRangesVersionAtom,
} from "./atoms";
import { PlaybackProvider, usePlaybackStore } from "./PlaybackProvider";
import {
  getAudioAvailable,
  getAudioMuted,
  setAudioMuted,
  setAudioVolume,
} from "./store-access";
import {
  audioBufferReadiness,
  detectElementHasAudio,
  shouldChaseAudioClock,
  useAudioStream,
} from "./use-audio-stream";

const HAVE_CURRENT_DATA = 2;
const HAVE_FUTURE_DATA = 3;

describe("audioBufferReadiness", () => {
  it("is ready when the time is inside a buffered range", () => {
    expect(
      audioBufferReadiness(5, {
        readyState: HAVE_FUTURE_DATA,
        buffered: [[0, 10]],
        duration: 60,
      }),
    ).toBe("ready");
  });

  it("is loading when the time falls in a buffer gap", () => {
    expect(
      audioBufferReadiness(15, {
        readyState: HAVE_FUTURE_DATA,
        buffered: [
          [0, 10],
          [20, 30],
        ],
        duration: 60,
      }),
    ).toBe("loading");
  });

  it("treats TimeRanges.end as exclusive", () => {
    expect(
      audioBufferReadiness(10, {
        readyState: HAVE_FUTURE_DATA,
        buffered: [[0, 10]],
        duration: 60,
      }),
    ).toBe("loading");
  });

  it("is loading below HAVE_FUTURE_DATA even when bytes are buffered", () => {
    expect(
      audioBufferReadiness(5, {
        readyState: HAVE_CURRENT_DATA,
        buffered: [[0, 10]],
        duration: 60,
      }),
    ).toBe("loading");
  });

  it("is ready past the audio's own end — silence never gates the barrier", () => {
    expect(
      audioBufferReadiness(59.99, {
        readyState: 0,
        buffered: [],
        duration: 60,
      }),
    ).toBe("ready");
    expect(
      audioBufferReadiness(75, {
        readyState: 0,
        buffered: [],
        duration: 60,
      }),
    ).toBe("ready");
  });

  it("does not apply the past-end passthrough before metadata (NaN duration)", () => {
    expect(
      audioBufferReadiness(5, {
        readyState: 0,
        buffered: [],
        duration: Number.NaN,
      }),
    ).toBe("loading");
  });

  it("short-circuits to ready on a fatal media error — a dead fetch never gates", () => {
    expect(
      audioBufferReadiness(5, {
        readyState: HAVE_CURRENT_DATA,
        buffered: [],
        duration: 60,
        errored: true,
      }),
    ).toBe("ready");
    expect(
      audioBufferReadiness(5, {
        readyState: 0,
        buffered: [],
        duration: Number.NaN,
        errored: true,
      }),
    ).toBe("ready");
  });
});

describe("shouldChaseAudioClock", () => {
  const base = {
    time: 10,
    elementTime: 10,
    paused: false,
    seeking: false,
    duration: 60,
  };

  it("chases when drift exceeds the tolerance during playback", () => {
    expect(shouldChaseAudioClock({ ...base, elementTime: 10.3 })).toBe(true);
    expect(shouldChaseAudioClock({ ...base, elementTime: 9.7 })).toBe(true);
  });

  it("leaves small drift alone — corrections are audible seams", () => {
    expect(shouldChaseAudioClock({ ...base, elementTime: 10.1 })).toBe(false);
  });

  it("never chases while paused — the seek binding owns currentTime", () => {
    expect(
      shouldChaseAudioClock({ ...base, elementTime: 20, paused: true }),
    ).toBe(false);
  });

  it("never chases mid-seek", () => {
    expect(
      shouldChaseAudioClock({ ...base, elementTime: 20, seeking: true }),
    ).toBe(false);
  });

  it("never chases past the audio's own end", () => {
    expect(
      shouldChaseAudioClock({
        ...base,
        time: 60.5,
        elementTime: 59,
        duration: 60,
      }),
    ).toBe(false);
  });
});

describe("detectElementHasAudio", () => {
  const element = (probes: Record<string, unknown>) =>
    probes as unknown as HTMLAudioElement;

  it("trusts mozHasAudio in either direction", () => {
    expect(detectElementHasAudio(element({ mozHasAudio: true }))).toBe(true);
    expect(detectElementHasAudio(element({ mozHasAudio: false }))).toBe(false);
  });

  it("trusts audioTracks length in either direction", () => {
    expect(detectElementHasAudio(element({ audioTracks: { length: 1 } }))).toBe(
      true,
    );
    expect(detectElementHasAudio(element({ audioTracks: { length: 0 } }))).toBe(
      false,
    );
  });

  it("treats decoded byte count as conclusive only when positive", () => {
    expect(
      detectElementHasAudio(element({ webkitAudioDecodedByteCount: 4096 })),
    ).toBe(true);
    expect(
      detectElementHasAudio(element({ webkitAudioDecodedByteCount: 0 })),
    ).toBe(null);
  });

  it("returns unknown when no probe is available", () => {
    expect(detectElementHasAudio(element({}))).toBe(null);
  });
});

// The hook owns its element (`new Audio()`), so the harness stubs the
// constructor with a controllable fake, mirroring useVideoSync's tests.
interface FakeAudioElement {
  preload: string;
  src: string;
  preservesPitch: boolean;
  currentTime: number;
  duration: number;
  paused: boolean;
  seeking: boolean;
  readyState: number;
  playbackRate: number;
  volume: number;
  muted: boolean;
  buffered: {
    length: number;
    start(i: number): number;
    end(i: number): number;
  };
  error: MediaError | null;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  load: ReturnType<typeof vi.fn>;
  removeAttribute: ReturnType<typeof vi.fn>;
  addEventListener(type: string, fn: EventListener): void;
  removeEventListener(type: string, fn: EventListener): void;
  _fire(type: string): void;
  _playResult: Promise<void>;
  mozHasAudio?: boolean;
}

function makeAudioElement(): FakeAudioElement {
  const listeners = new Map<string, EventListener[]>();
  const el: FakeAudioElement = {
    preload: "",
    src: "",
    preservesPitch: false,
    currentTime: 0,
    duration: Number.NaN,
    paused: true,
    seeking: false,
    readyState: 0,
    playbackRate: 1,
    volume: 1,
    muted: false,
    buffered: { length: 0, start: () => 0, end: () => 0 },
    error: null,
    _playResult: Promise.resolve(),
    play: vi.fn(() => {
      el.paused = false;
      return el._playResult;
    }),
    pause: vi.fn(() => {
      el.paused = true;
    }),
    load: vi.fn(),
    removeAttribute: vi.fn((name: string) => {
      if (name === "src") el.src = "";
    }),
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
    // probeHasAudio detaches itself mid-dispatch; iterate a copy
    _fire: (type) => {
      for (const fn of [...(listeners.get(type) ?? [])]) fn(new Event(type));
    },
  };
  return el;
}

describe("useAudioStream (provider integration)", () => {
  let created: FakeAudioElement[] = [];

  beforeEach(() => {
    created = [];
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.stubGlobal("Audio", function AudioStub() {
      const el = makeAudioElement();
      created.push(el);
      return el;
    } as unknown as typeof Audio);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function renderAudio(options: { enabled?: boolean } = {}) {
    return renderHook(
      () => {
        const store = usePlaybackStore();
        const { hasAudio } = useAudioStream("audio", "blob:audio", options);
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

  it("creates no element and publishes no availability while disabled", () => {
    const { result } = renderAudio({ enabled: false });
    expect(created).toHaveLength(0);
    expect(getAudioAvailable(result.current.store)).toBe("unavailable");
  });

  it("publishes availability only once metadata arrives", () => {
    const { result } = renderAudio();
    expect(created).toHaveLength(1);
    const el = created[0];
    expect(el.preservesPitch).toBe(true);
    expect(getAudioAvailable(result.current.store)).toBe("unavailable");
    act(() => el._fire("loadedmetadata"));
    expect(getAudioAvailable(result.current.store)).toBe("available");
  });

  it("tolerates unmute (subscribe) before metadata (register)", async () => {
    const { result } = renderAudio();
    const el = created[0];
    // the activation effect subscribes an id the engine has not seen
    // registered yet; the refcount tolerates the ordering
    act(() => setAudioMuted(result.current.store, false));
    act(() => el._fire("loadedmetadata"));
    await act(async () => {
      result.current.store.set(isPlayingAtom, true);
    });
    expect(el.play).toHaveBeenCalled();
  });

  it("never drives play while muted — the stream is dormant", async () => {
    const { result } = renderAudio();
    const el = created[0];
    act(() => el._fire("loadedmetadata"));
    await act(async () => {
      result.current.store.set(isPlayingAtom, true);
    });
    expect(el.play).not.toHaveBeenCalled();
  });

  it("pauses the element while the engine buffers, resumes after", async () => {
    const { result } = renderAudio();
    const el = created[0];
    act(() => el._fire("loadedmetadata"));
    act(() => setAudioMuted(result.current.store, false));
    await act(async () => {
      result.current.store.set(isPlayingAtom, true);
    });
    expect(el.paused).toBe(false);

    await act(async () => {
      result.current.store.set(isBufferingAtom, true);
    });
    expect(el.paused).toBe(true);

    el.play.mockClear();
    await act(async () => {
      result.current.store.set(isBufferingAtom, false);
    });
    expect(el.play).toHaveBeenCalledTimes(1);
  });

  it("re-mutes when the browser rejects unmuted playback", async () => {
    const { result } = renderAudio();
    const el = created[0];
    act(() => el._fire("loadedmetadata"));
    act(() => setAudioMuted(result.current.store, false));
    el._playResult = Promise.reject(
      new DOMException("autoplay is not allowed", "NotAllowedError"),
    );
    // pre-attach a handler so the rejection is never unobserved
    void el._playResult.catch(() => undefined);
    await act(async () => {
      result.current.store.set(isPlayingAtom, true);
    });
    expect(getAudioMuted(result.current.store)).toBe(true);
  });

  it("keeps the unmute when the buffering gate interrupts the pending play", async () => {
    const { result } = renderAudio();
    const el = created[0];
    act(() => el._fire("loadedmetadata"));

    // picture is rolling; audio is dormant (session starts muted)
    await act(async () => {
      result.current.store.set(isPlayingAtom, true);
    });
    expect(el.play).not.toHaveBeenCalled();

    // the unmute's play() stays pending...
    let rejectPlay: (e: unknown) => void = () => undefined;
    el._playResult = new Promise<void>((_, reject) => {
      rejectPlay = reject;
    });
    void el._playResult.catch(() => undefined);

    act(() => setAudioMuted(result.current.store, false));
    expect(el.play).toHaveBeenCalledTimes(1);

    // ...until the engine's barrier pauses for buffering, which rejects
    // the interrupted play with AbortError
    await act(async () => {
      result.current.store.set(isBufferingAtom, true);
      rejectPlay(new DOMException("interrupted by pause()", "AbortError"));
    });

    // the user's unmute survives — AbortError is not an autoplay denial
    expect(getAudioMuted(result.current.store)).toBe(false);
  });

  it("anchors the element clock to the playhead on activation", async () => {
    const { result } = renderAudio();
    const el = created[0];
    el.duration = 10;
    act(() => el._fire("loadedmetadata"));

    // playhead advanced while the stream was dormant; the element's clock
    // never followed (no seek events during continuous playback, and the
    // drift-chase only runs while the element plays)
    await act(async () => {
      result.current.store.set(isPlayingAtom, true);
      result.current.store.set(playheadAtom, 5);
    });
    expect(el.currentTime).toBe(0);

    act(() => setAudioMuted(result.current.store, false));
    expect(el.currentTime).toBe(5);
  });

  it("wakes a barrier-held engine when the audio fetch dies", () => {
    const { result } = renderAudio();
    const el = created[0];
    act(() => el._fire("loadedmetadata"));

    const before = result.current.store.get(streamRangesVersionAtom);
    act(() => {
      el.error = { code: 2 /* MEDIA_ERR_NETWORK */ } as MediaError;
      el._fire("error");
    });
    // the engine re-polls readiness on this signal; with element.error set,
    // audioBufferReadiness short-circuits to "ready" and the barrier lifts
    expect(result.current.store.get(streamRangesVersionAtom)).toBeGreaterThan(
      before,
    );
  });

  it("publishes the fatal error for the UI and clears it on teardown", () => {
    const { result, unmount } = renderAudio();
    const el = created[0];
    act(() => el._fire("loadedmetadata"));
    expect(getAudioAvailable(result.current.store)).toBe("available");

    act(() => {
      el.error = { code: 2 /* MEDIA_ERR_NETWORK */ } as MediaError;
      el._fire("error");
    });
    expect(getAudioAvailable(result.current.store)).toBe("error");

    const store = result.current.store;
    unmount();
    expect(getAudioAvailable(store)).toBe("unavailable");
  });

  it("clears a pre-metadata fatal error on teardown", () => {
    const { result, unmount } = renderAudio();
    const el = created[0];
    act(() => {
      el.error = { code: 4 /* MEDIA_ERR_SRC_NOT_SUPPORTED */ } as MediaError;
      el._fire("error");
    });
    expect(getAudioAvailable(result.current.store)).toBe("error");

    const store = result.current.store;
    unmount();
    expect(getAudioAvailable(store)).toBe("unavailable");
  });

  it("ignores non-fatal error events (element.error stays null)", () => {
    const { result } = renderAudio();
    const el = created[0];
    act(() => el._fire("loadedmetadata"));
    act(() => el._fire("error"));
    expect(getAudioAvailable(result.current.store)).toBe("available");
  });

  it("drops availability and never plays on a conclusive no-track verdict", async () => {
    const { result } = renderAudio();
    const el = created[0];
    el.mozHasAudio = false;
    act(() => el._fire("loadedmetadata"));
    act(() => el._fire("loadeddata"));
    expect(result.current.hasAudio).toBe(false);
    expect(getAudioAvailable(result.current.store)).toBe("unavailable");

    act(() => setAudioMuted(result.current.store, false));
    await act(async () => {
      result.current.store.set(isPlayingAtom, true);
    });
    expect(el.play).not.toHaveBeenCalled();
  });

  it("clamps seek events onto the element clock", () => {
    const { result } = renderAudio();
    const el = created[0];
    el.duration = 8;
    act(() => result.current.store.set(seekEventAtom, { time: 9, seq: 1 }));
    expect(el.currentTime).toBe(8);
    act(() => result.current.store.set(seekEventAtom, { time: -1, seq: 2 }));
    expect(el.currentTime).toBe(0);
  });

  it("mirrors speed, volume, and mute atoms onto the element", () => {
    const { result } = renderAudio();
    const el = created[0];
    act(() => el._fire("loadedmetadata"));
    expect(el.muted).toBe(true);
    expect(el.volume).toBe(DEFAULT_AUDIO_VOLUME);

    act(() => {
      result.current.store.set(speedAtom, 2);
      setAudioVolume(result.current.store, 0.3);
      setAudioMuted(result.current.store, false);
    });
    expect(el.playbackRate).toBe(2);
    expect(el.volume).toBe(0.3);
    expect(el.muted).toBe(false);
  });

  it("releases the media resource and availability on unmount", () => {
    const { result, unmount } = renderAudio();
    const el = created[0];
    act(() => el._fire("loadedmetadata"));
    const store = result.current.store;
    expect(getAudioAvailable(store)).toBe("available");

    unmount();
    expect(el.pause).toHaveBeenCalled();
    expect(el.removeAttribute).toHaveBeenCalledWith("src");
    expect(el.load).toHaveBeenCalled();
    expect(getAudioAvailable(store)).toBe("unavailable");
  });
});

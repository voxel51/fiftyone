import { act, cleanup, render } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_AUDIO_VOLUME } from "./atoms";
import { PlaybackProvider } from "./PlaybackProvider";
import { usePlaybackStore } from "./playback-store-context";
import {
  getAudioAvailable,
  getAudioMuted,
  setAudioMuted,
  setAudioVolume,
} from "./store-access";
import type { PlaybackStore } from "./types";
import { useMediaElementAudio } from "./use-media-element-audio";

let store: PlaybackStore | null = null;

const Harness: React.FC<{
  mediaRef: React.RefObject<HTMLMediaElement | null>;
}> = ({ mediaRef }) => {
  store = usePlaybackStore();
  useMediaElementAudio(mediaRef);
  return null;
};

function renderHook(element: HTMLMediaElement) {
  return render(
    <PlaybackProvider duration={10} stepInterval={1 / 30}>
      <Harness mediaRef={{ current: element }} />
    </PlaybackProvider>,
  );
}

function makeVideo(): HTMLVideoElement {
  return document.createElement("video");
}

describe("useMediaElementAudio", () => {
  beforeEach(() => {
    store = null;
    window.localStorage.clear();
  });
  afterEach(() => cleanup());

  it("publishes availability while the track presence is unknown", () => {
    // unknown must not lock the user out of unmuting
    renderHook(makeVideo());
    expect(getAudioAvailable(store as PlaybackStore)).toBe(true);
  });

  it("hides availability on a conclusive no-audio-track signal", () => {
    const video = makeVideo();
    Object.defineProperty(video, "mozHasAudio", { value: false });
    renderHook(video);
    // detection is conclusive only from `loadeddata` on
    expect(getAudioAvailable(store as PlaybackStore)).toBe(true);
    act(() => {
      video.dispatchEvent(new Event("loadeddata"));
    });
    expect(getAudioAvailable(store as PlaybackStore)).toBe(false);
  });

  it("applies the muted default and persisted volume to the element", () => {
    const video = makeVideo();
    renderHook(video);
    expect(video.muted).toBe(true);
    expect(video.volume).toBe(DEFAULT_AUDIO_VOLUME);
  });

  it("follows atom changes onto the element", () => {
    const video = makeVideo();
    renderHook(video);
    act(() => {
      setAudioMuted(store as PlaybackStore, false);
      setAudioVolume(store as PlaybackStore, 0.4);
    });
    expect(video.muted).toBe(false);
    expect(video.volume).toBe(0.4);
  });

  it("re-mutes the element and clears availability on unmount", () => {
    const video = makeVideo();
    const view = renderHook(video);
    const s = store as PlaybackStore;
    act(() => setAudioMuted(s, false));
    expect(video.muted).toBe(false);

    view.unmount();
    expect(video.muted).toBe(true);
    expect(getAudioAvailable(s)).toBe(false);
  });

  it("reflects an element self-mute back into the atom", () => {
    const video = makeVideo();
    renderHook(video);
    const s = store as PlaybackStore;
    act(() => setAudioMuted(s, false));

    // browser self-mute: rejected unmuted playback
    act(() => {
      video.muted = true;
      video.dispatchEvent(new Event("volumechange"));
    });
    expect(getAudioMuted(s)).toBe(true);
  });
});

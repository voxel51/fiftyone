import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React, { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PlaybackProvider } from "../../lib/playback/PlaybackProvider";
import { usePlaybackStore } from "../../lib/playback/playback-store-context";
import {
  getTrackMuted,
  getTrackVolume,
  registerAudioTrack,
} from "../../lib/playback/store-access";
import type { PlaybackStore } from "../../lib/playback/types";
import MixedAudioDropdown from "./MixedAudioDropdown";

let store: PlaybackStore | null = null;

/** Registers a fixed set of fake audio tracks against the provider's store. */
const RegisterFakeTracks: React.FC<{
  tracks: Array<{ id: string; label: string }>;
}> = ({ tracks }) => {
  const s = usePlaybackStore();
  store = s;
  useEffect(() => {
    const unregisters = tracks.map((track) =>
      registerAudioTrack(s, { ...track, kind: "native-element" }),
    );
    return () => {
      for (const unregister of unregisters) unregister();
    };
  }, [s, tracks]);
  return null;
};

function renderDropdown(tracks: Array<{ id: string; label: string }>) {
  return render(
    <PlaybackProvider duration={10} stepInterval={1 / 30}>
      <RegisterFakeTracks tracks={tracks} />
      <MixedAudioDropdown />
    </PlaybackProvider>,
  );
}

describe("MixedAudioDropdown", () => {
  beforeEach(() => {
    store = null;
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  afterEach(() => cleanup());

  it("renders nothing when no tracks are registered", () => {
    renderDropdown([]);
    expect(screen.queryByTestId("timeline-controls-mixed")).toBeNull();
  });

  it("renders the trigger and opens a row per registered track", () => {
    renderDropdown([
      { id: "a", label: "Track A" },
      { id: "b", label: "Track B" },
    ]);
    fireEvent.click(screen.getByTestId("timeline-controls-mixed"));

    expect(screen.getByText("Track A")).toBeTruthy();
    expect(screen.getByText("Track B")).toBeTruthy();
  });

  it("writes each row's controls to that track's own atoms only — no cross-track bleed", () => {
    renderDropdown([
      { id: "a", label: "Track A" },
      { id: "b", label: "Track B" },
    ]);
    fireEvent.click(screen.getByTestId("timeline-controls-mixed"));

    const volumeA = screen.getByTestId("timeline-mixed-track-a-volume");
    fireEvent.change(volumeA, { target: { value: "0.25" } });

    expect(getTrackVolume(store as PlaybackStore, "a")).toBeCloseTo(0.25);
    // Track B's own fader (default unity) is untouched by A's slider.
    expect(getTrackVolume(store as PlaybackStore, "b")).toBe(1);

    const muteB = screen.getByTestId("timeline-mixed-track-b-mute");
    fireEvent.click(muteB);
    expect(getTrackMuted(store as PlaybackStore, "b")).toBe(true);
    expect(getTrackMuted(store as PlaybackStore, "a")).toBe(false);
  });
});

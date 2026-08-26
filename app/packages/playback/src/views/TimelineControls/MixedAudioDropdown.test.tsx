import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import React, { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PlaybackProvider } from "../../lib/playback/PlaybackProvider";
import { usePlaybackStore } from "../../lib/playback/playback-store-context";
import {
  getTrackMuted,
  getTrackVolume,
  registerAudioTrack,
  setTrackVolume,
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

  it("writes each row's mute to that track's own atom only — no cross-track bleed", () => {
    renderDropdown([
      { id: "a", label: "Track A" },
      { id: "b", label: "Track B" },
    ]);
    fireEvent.click(screen.getByTestId("timeline-controls-mixed"));

    fireEvent.click(screen.getByTestId("timeline-mixed-track-b-mute"));
    expect(getTrackMuted(store as PlaybackStore, "b")).toBe(true);
    expect(getTrackMuted(store as PlaybackStore, "a")).toBe(false);

    fireEvent.click(screen.getByTestId("timeline-mixed-track-a-mute"));
    expect(getTrackMuted(store as PlaybackStore, "a")).toBe(true);
    expect(getTrackMuted(store as PlaybackStore, "b")).toBe(true);
  });

  it("renders each track's own volume, not a shared one", () => {
    // Drives the atoms directly rather than the slider: voodo's
    // `SingleValueSlider` puts our `data-testid` on a wrapper element, not
    // on an input with a value setter, so `fireEvent.change` cannot reach
    // it. What matters here is that each row is bound to its OWN track's
    // state, which the rendered readouts show.
    renderDropdown([
      { id: "a", label: "Track A" },
      { id: "b", label: "Track B" },
    ]);
    fireEvent.click(screen.getByTestId("timeline-controls-mixed"));

    // Wrapped in act(): a direct store write has no fireEvent around it,
    // so React would not have re-rendered the rows before the assertions.
    act(() => setTrackVolume(store as PlaybackStore, "a", 0.25));

    expect(getTrackVolume(store as PlaybackStore, "a")).toBeCloseTo(0.25);
    expect(getTrackVolume(store as PlaybackStore, "b")).toBe(1);
    // Scoped to each row: asserting the readouts globally would still pass
    // if both rows read the same track's atoms and merely happened to render
    // one "25%" and one "100%" somewhere in the popover.
    const rowA = screen.getByTestId("timeline-mixed-track-a");
    const rowB = screen.getByTestId("timeline-mixed-track-b");
    expect(within(rowA).getByText("25%")).toBeTruthy();
    expect(within(rowB).getByText("100%")).toBeTruthy();
    expect(within(rowA).queryByText("100%")).toBeNull();
    expect(within(rowB).queryByText("25%")).toBeNull();
  });
});

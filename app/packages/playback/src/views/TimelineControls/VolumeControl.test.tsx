import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import React, { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type AudioAvailability,
  DEFAULT_AUDIO_VOLUME,
} from "../../lib/playback/atoms";
import { PlaybackProvider } from "../../lib/playback/PlaybackProvider";
import { usePlaybackStore } from "../../lib/playback/playback-store-context";
import {
  getAudioMuted,
  getAudioVolume,
  getMasterMuted,
  getMasterVolume,
  setAudioAvailable,
  setAudioVolume,
  setMasterMuted,
} from "../../lib/playback/store-access";
import type { PlaybackStore } from "../../lib/playback/types";
import TimelineControls from "./TimelineControls";

let store: PlaybackStore | null = null;

/** Captures the provider's store and publishes audio availability. */
const Capture: React.FC<{ availability?: AudioAvailability }> = ({
  availability = "available",
}) => {
  const s = usePlaybackStore();
  store = s;
  useEffect(() => {
    if (availability !== "unavailable") {
      setAudioAvailable(s, availability);
    }
  }, [availability, s]);
  return null;
};

function renderControls(opts: { availability?: AudioAvailability } = {}) {
  return render(
    <PlaybackProvider duration={10} stepInterval={1 / 30}>
      <Capture availability={opts.availability} />
      {/* TimelineControls renders the audio controls itself now, right after
          the transport buttons — passing one in as well would put two in the
          row. Rendering the bare row keeps this suite on the integrated
          shape. */}
      <TimelineControls />
    </PlaybackProvider>,
  );
}

/**
 * The fader is always mounted beside the mute button — it only animates its
 * width open on hover — so nothing has to be opened before driving it.
 */

/** The mute button, labelled by its channel ("Master"). */
function muteButton(name: "Mute" | "Unmute") {
  return screen.getByRole("button", { name: `${name} Master` });
}

describe("VolumeControl", () => {
  beforeEach(() => {
    store = null;
    // volume persists to localStorage, mute to sessionStorage
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  afterEach(() => cleanup());

  it("renders nothing while no audio integration has published availability", () => {
    renderControls({ availability: "unavailable" });
    expect(screen.queryByTestId("timeline-controls-mute")).toBeNull();
  });

  it("disables the control and names the failure on a fatal audio error", () => {
    renderControls({ availability: "error" });
    const toggle = screen.getByTestId("timeline-controls-mute");
    expect(toggle.getAttribute("aria-label")).toBe("Audio failed to load");
    expect(toggle.hasAttribute("disabled")).toBe(true);
  });

  it("renders the toggle once audio is available, muted by default", () => {
    renderControls();
    expect(screen.getByTestId("timeline-controls-mute")).toBeTruthy();
    expect(muteButton("Unmute").getAttribute("aria-pressed")).toBe("true");
  });

  it("unmuting restores the default volume on first ever use", () => {
    renderControls();
    fireEvent.click(muteButton("Unmute"));
    expect(getAudioMuted(store as PlaybackStore)).toBe(false);
    expect(getAudioVolume(store as PlaybackStore)).toBe(DEFAULT_AUDIO_VOLUME);
    expect(muteButton("Mute")).toBeTruthy();
  });

  it("unmuting with a zero persisted volume falls back to the default level", () => {
    renderControls();
    setAudioVolume(store as PlaybackStore, 0);
    fireEvent.click(muteButton("Unmute"));
    expect(getAudioVolume(store as PlaybackStore)).toBe(DEFAULT_AUDIO_VOLUME);
    expect(getAudioMuted(store as PlaybackStore)).toBe(false);
  });

  // NOTE: arrow-key volume control was lost in the move from `VerticalFader`
  // to voodo's `SingleValueSlider`, which ships no keyboard handling (its
  // knob has `role="slider"` and `tabindex="0"` but no `onKeyDown`). The
  // mixer's faders have the same gap. Tests for it removed with the
  // capability; restore both together.

  it("unmute and volume survive a provider swap within the session", () => {
    const first = renderControls();
    fireEvent.click(muteButton("Unmute"));
    setAudioVolume(store as PlaybackStore, 0.42);
    first.unmount();

    renderControls();
    expect(getAudioMuted(store as PlaybackStore)).toBe(false);
    expect(getAudioVolume(store as PlaybackStore)).toBeCloseTo(0.42);
  });

  it("reads and writes through useAudio()'s master accessors (same atoms as the legacy names)", () => {
    renderControls();
    fireEvent.click(muteButton("Unmute"));
    expect(getMasterMuted(store as PlaybackStore)).toBe(false);
    expect(getAudioMuted(store as PlaybackStore)).toBe(false);

    // Direct store writes bypass fireEvent's implicit act(), so React has
    // not re-rendered the popover yet when the assertion runs.
    act(() => setMasterMuted(store as PlaybackStore, true));
    expect(getAudioMuted(store as PlaybackStore)).toBe(true);
    expect(muteButton("Unmute")).toBeTruthy();

    expect(getMasterVolume(store as PlaybackStore)).toBe(
      getAudioVolume(store as PlaybackStore),
    );
  });

  it("a new session starts muted but keeps the persisted volume", () => {
    const first = renderControls();
    fireEvent.click(muteButton("Unmute"));
    setAudioVolume(store as PlaybackStore, 0.42);
    first.unmount();

    window.sessionStorage.clear();
    renderControls();
    expect(getAudioMuted(store as PlaybackStore)).toBe(true);
    fireEvent.click(muteButton("Unmute"));
    expect(getAudioVolume(store as PlaybackStore)).toBeCloseTo(0.42);
  });
});

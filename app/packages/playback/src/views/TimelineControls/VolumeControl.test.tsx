import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import React, { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

function renderControls(
  opts: { availability?: AudioAvailability; onToggle?: () => void } = {},
) {
  return render(
    <PlaybackProvider duration={10} stepInterval={1 / 30}>
      <Capture availability={opts.availability} />
      {/* TimelineControls renders the audio controls itself now, right after
          the transport buttons — passing one in as well would put two in the
          row. The toggle callback aside, rendering the row bare keeps this
          suite on the integrated shape. */}
      <TimelineControls onToggle={opts.onToggle} />
    </PlaybackProvider>,
  );
}

/**
 * The fader is always mounted beside the mute button — it only animates its
 * width open on hover — so nothing has to be opened before driving it.
 */

/**
 * The fader's knob — voodo puts the ARIA slider contract and the keyboard
 * handling there, not on the wrapper, so key events have to land on it.
 */
function knob() {
  return screen.getByRole("slider");
}

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

  it("clicks on the volume group never toggle the tracks drawer", () => {
    const onToggle = vi.fn();
    renderControls({ onToggle });
    fireEvent.click(screen.getByTestId("timeline-controls-volume-control"));
    fireEvent.click(screen.getByTestId("timeline-controls-volume"));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("clicks on bare slider internals never toggle the tracks drawer", () => {
    // The original bug's path: the slider renders roleless divs, so a click
    // on its innermost node bubbles to the drawer toggle unless guarded.
    const onToggle = vi.fn();
    renderControls({ onToggle });

    let node: Element = screen.getByTestId("timeline-controls-volume");
    while (node.firstElementChild) {
      node = node.firstElementChild;
    }

    fireEvent.click(node);
    expect(onToggle).not.toHaveBeenCalled();
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

  // The slider updates its own knob synchronously but emits `onChange`
  // through a debounce, so the store write lands a tick later even at
  // `debounceDelay={0}` — these have to wait for it rather than read
  // straight after the keypress.
  it("arrow keys raise the volume and unmute", async () => {
    renderControls();
    fireEvent.keyDown(knob(), { key: "ArrowUp" });
    await waitFor(() =>
      expect(getAudioMuted(store as PlaybackStore)).toBe(false),
    );
    expect(getAudioVolume(store as PlaybackStore)).toBeCloseTo(0.05);
  });

  it("stepping down to zero mutes but preserves the stored volume", async () => {
    renderControls();
    fireEvent.keyDown(knob(), { key: "ArrowUp" }); // unmuted at 0.05
    await waitFor(() =>
      expect(getAudioMuted(store as PlaybackStore)).toBe(false),
    );
    fireEvent.keyDown(knob(), { key: "ArrowDown" }); // back to 0 -> mute
    await waitFor(() =>
      expect(getAudioMuted(store as PlaybackStore)).toBe(true),
    );
    expect(getAudioVolume(store as PlaybackStore)).toBeCloseTo(0.05);
  });

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

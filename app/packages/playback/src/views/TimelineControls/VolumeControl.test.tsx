import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  setAudioAvailable,
  setAudioVolume,
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
      <TimelineControls onToggle={opts.onToggle} />
    </PlaybackProvider>,
  );
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
    expect(screen.queryByTestId("timeline-controls-volume-group")).toBeNull();
  });

  it("disables the control with an error tooltip on a fatal audio error", () => {
    renderControls({ availability: "error" });
    const group = screen.getByTestId("timeline-controls-volume-group");
    expect(group.getAttribute("title")).toBe("Audio failed to load");
    const mute = screen.getByTestId("timeline-controls-mute");
    expect(mute.hasAttribute("disabled")).toBe(true);
  });

  it("renders the group once audio is available, muted by default", () => {
    renderControls();
    expect(screen.getByTestId("timeline-controls-volume-group")).toBeTruthy();
    const mute = screen.getByRole("button", { name: "Unmute" });
    expect(mute.getAttribute("aria-pressed")).toBe("true");
  });

  it("clicks on the volume group never toggle the tracks drawer", () => {
    const onToggle = vi.fn();
    renderControls({ onToggle });
    fireEvent.click(screen.getByTestId("timeline-controls-volume-group"));
    fireEvent.click(screen.getByTestId("timeline-controls-volume"));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("unmuting restores the default volume on first ever use", () => {
    renderControls();
    fireEvent.click(screen.getByRole("button", { name: "Unmute" }));
    expect(getAudioMuted(store as PlaybackStore)).toBe(false);
    expect(getAudioVolume(store as PlaybackStore)).toBe(DEFAULT_AUDIO_VOLUME);
    expect(screen.getByRole("button", { name: "Mute" })).toBeTruthy();
  });

  it("unmuting with a zero persisted volume falls back to the default level", () => {
    renderControls();
    setAudioVolume(store as PlaybackStore, 0);
    fireEvent.click(screen.getByRole("button", { name: "Unmute" }));
    expect(getAudioVolume(store as PlaybackStore)).toBe(DEFAULT_AUDIO_VOLUME);
    expect(getAudioMuted(store as PlaybackStore)).toBe(false);
  });

  it("arrow keys raise the volume and unmute", () => {
    renderControls();
    const group = screen.getByTestId("timeline-controls-volume-group");
    fireEvent.keyDown(group, { key: "ArrowUp" });
    expect(getAudioMuted(store as PlaybackStore)).toBe(false);
    expect(getAudioVolume(store as PlaybackStore)).toBeCloseTo(0.05);
  });

  it("stepping down to zero mutes but preserves the stored volume", () => {
    renderControls();
    const group = screen.getByTestId("timeline-controls-volume-group");
    fireEvent.keyDown(group, { key: "ArrowUp" }); // unmuted at 0.05
    fireEvent.keyDown(group, { key: "ArrowDown" }); // back to 0 → mute
    expect(getAudioMuted(store as PlaybackStore)).toBe(true);
    expect(getAudioVolume(store as PlaybackStore)).toBeCloseTo(0.05);
  });

  it("unmute and volume survive a provider swap within the session", () => {
    const first = renderControls();
    fireEvent.click(screen.getByRole("button", { name: "Unmute" }));
    setAudioVolume(store as PlaybackStore, 0.42);
    first.unmount();

    renderControls();
    expect(getAudioMuted(store as PlaybackStore)).toBe(false);
    expect(getAudioVolume(store as PlaybackStore)).toBeCloseTo(0.42);
  });

  it("a new session starts muted but keeps the persisted volume", () => {
    const first = renderControls();
    fireEvent.click(screen.getByRole("button", { name: "Unmute" }));
    setAudioVolume(store as PlaybackStore, 0.42);
    first.unmount();

    window.sessionStorage.clear();
    renderControls();
    expect(getAudioMuted(store as PlaybackStore)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Unmute" }));
    expect(getAudioVolume(store as PlaybackStore)).toBeCloseTo(0.42);
  });
});

import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import {
  getAudioTracks,
  getEffectiveTrackMuted,
  getEffectiveTrackVolume,
  getTrackMuted,
  getTrackVolume,
  registerAudioTrack,
  setMasterMuted,
  setMasterVolume,
  setTrackMuted,
  setTrackVolume,
  unregisterAudioTrack,
} from "./store-access";

describe("audio track registry", () => {
  it("replaces a duplicate id in place, holding the roster's order", () => {
    const store = createStore();

    const unregisterA = registerAudioTrack(store, {
      id: "a",
      label: "Track A",
      kind: "native-element",
    });
    registerAudioTrack(store, {
      id: "b",
      label: "Track B",
      kind: "foxglove-raw",
    });
    // Re-registering "a" should replace, not duplicate — and must not move
    // it. The roster is the mixer's row order, and re-registration happens
    // on any descriptor change, so appending would reshuffle the rows under
    // the user as they muted tracks.
    registerAudioTrack(store, {
      id: "a",
      label: "Track A (renamed)",
      kind: "native-element",
    });

    expect(getAudioTracks(store)).toEqual([
      { id: "a", label: "Track A (renamed)", kind: "native-element" },
      { id: "b", label: "Track B", kind: "foxglove-raw" },
    ]);

    unregisterA();
    expect(getAudioTracks(store)).toEqual([
      { id: "b", label: "Track B", kind: "foxglove-raw" },
    ]);

    unregisterAudioTrack(store, "b");
    expect(getAudioTracks(store)).toEqual([]);
  });

  it("isolates per-track volume/mute across track ids", () => {
    const store = createStore();

    setTrackVolume(store, "a", 0.3);
    setTrackVolume(store, "b", 0.9);
    setTrackMuted(store, "a", true);

    expect(getTrackVolume(store, "a")).toBeCloseTo(0.3);
    expect(getTrackVolume(store, "b")).toBeCloseTo(0.9);
    expect(getTrackMuted(store, "a")).toBe(true);
    expect(getTrackMuted(store, "b")).toBe(false);
  });

  it("computes effective volume/mute from track and master faders", () => {
    const store = createStore();
    setMasterVolume(store, 0.5);
    setMasterMuted(store, false);
    setTrackVolume(store, "a", 0.5);
    setTrackMuted(store, "a", false);

    expect(getEffectiveTrackVolume(store, "a")).toBeCloseTo(0.25);
    expect(getEffectiveTrackMuted(store, "a")).toBe(false);

    setMasterMuted(store, true);
    expect(getEffectiveTrackVolume(store, "a")).toBe(0);
    expect(getEffectiveTrackMuted(store, "a")).toBe(true);
  });
});

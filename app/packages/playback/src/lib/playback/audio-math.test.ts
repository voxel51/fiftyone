import { describe, expect, it } from "vitest";
import { effectiveMuted, effectiveVolume, volumeMagnitude } from "./audio-math";

describe("effectiveVolume", () => {
  it("multiplies track and master volume when neither is muted", () => {
    expect(
      effectiveVolume({
        trackVolume: 0.5,
        trackMuted: false,
        masterVolume: 0.5,
        masterMuted: false,
      }),
    ).toBeCloseTo(0.25);
  });

  it("is zero when only the track is muted", () => {
    expect(
      effectiveVolume({
        trackVolume: 1,
        trackMuted: true,
        masterVolume: 1,
        masterMuted: false,
      }),
    ).toBe(0);
  });

  it("is zero when only the master is muted", () => {
    expect(
      effectiveVolume({
        trackVolume: 1,
        trackMuted: false,
        masterVolume: 1,
        masterMuted: true,
      }),
    ).toBe(0);
  });

  it("is zero when both are muted", () => {
    expect(
      effectiveVolume({
        trackVolume: 1,
        trackMuted: true,
        masterVolume: 1,
        masterMuted: true,
      }),
    ).toBe(0);
  });

  it("clamps out-of-range inputs before multiplying", () => {
    expect(
      effectiveVolume({
        trackVolume: 2,
        trackMuted: false,
        masterVolume: -1,
        masterMuted: false,
      }),
    ).toBe(0);

    expect(
      effectiveVolume({
        trackVolume: 2,
        trackMuted: false,
        masterVolume: 0.5,
        masterMuted: false,
      }),
    ).toBeCloseTo(0.5);
  });

  it("full volume on both faders yields unity gain", () => {
    expect(
      effectiveVolume({
        trackVolume: 1,
        trackMuted: false,
        masterVolume: 1,
        masterMuted: false,
      }),
    ).toBe(1);
  });
});

describe("effectiveMuted", () => {
  it("is false only when neither is muted", () => {
    expect(effectiveMuted({ trackMuted: false, masterMuted: false })).toBe(
      false,
    );
  });

  it("is true if the track is muted", () => {
    expect(effectiveMuted({ trackMuted: true, masterMuted: false })).toBe(true);
  });

  it("is true if the master is muted", () => {
    expect(effectiveMuted({ trackMuted: false, masterMuted: true })).toBe(true);
  });

  it("is true if both are muted", () => {
    expect(effectiveMuted({ trackMuted: true, masterMuted: true })).toBe(true);
  });
});

describe("volumeMagnitude", () => {
  it("multiplies track and master volume, ignoring mute entirely", () => {
    expect(
      volumeMagnitude({ trackVolume: 0.5, masterVolume: 0.5 }),
    ).toBeCloseTo(0.25);
  });

  it("clamps out-of-range inputs before multiplying", () => {
    expect(volumeMagnitude({ trackVolume: 2, masterVolume: -1 })).toBe(0);
    expect(volumeMagnitude({ trackVolume: 2, masterVolume: 0.5 })).toBeCloseTo(
      0.5,
    );
  });
});

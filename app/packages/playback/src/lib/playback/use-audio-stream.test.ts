import { describe, expect, it } from "vitest";
import {
  audioBufferReadiness,
  detectElementHasAudio,
  shouldChaseAudioClock,
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

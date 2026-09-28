import { renderHook } from "@testing-library/react";
import React from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { PlaybackProvider } from "@fiftyone/playback";
import { useAudioStreamPlayback } from "./use-audio-stream-playback";
import type { AudioStreamSource } from "./use-audio-stream-playback";

const RATE = 8000;
const DURATION = 10;

// The streaming transport only activates in a cross-origin-isolated context.
beforeAll(() => {
  vi.stubGlobal("crossOriginIsolated", true);
  // A fake engine, so no real AudioContext/worklet is needed.
  (globalThis as Record<string, unknown>).__FO_TEST_AUDIO_ENGINE_FACTORY = () =>
    Promise.resolve({
      node: {
        connect: () => undefined,
        disconnect: () => undefined,
        port: {},
      },
      audioContext: {
        createGain: () => ({
          connect: () => undefined,
          disconnect: () => undefined,
          gain: {
            value: 1,
            setValueAtTime: () => undefined,
            cancelScheduledValues: () => undefined,
          },
        }),
        destination: {},
        close: () => Promise.resolve(),
        currentTime: 0,
        resume: () => Promise.resolve(),
        suspend: () => Promise.resolve(),
        state: "running",
      },
      channels: 1,
      sampleRate: RATE,
      // Never drains: this is the "nothing is playing" case that used to
      // stop the waveform at the buffer's runway.
      availableWrite: () => 0,
      bufferedFrames: () => 0,
      push: () => 0,
      seek: () => undefined,
      markEnded: () => undefined,
      playedSeconds: () => 0,
      underrunFrames: () => 0,
      dispose: () => Promise.resolve(),
    });
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PlaybackProvider duration={DURATION} stepInterval={1 / 30}>
    {children}
  </PlaybackProvider>
);

describe("useAudioStreamPlayback", () => {
  // The audio is downloaded once, for playback, and the waveform is drawn
  // from those same chunks. So downloading has to follow playback: if
  // nothing is playing, nothing should keep downloading. A recording can be
  // hours long, and downloading it a second time just to draw it is not an
  // option.
  it("stops downloading when playback is not using the audio", async () => {
    const readAt: number[] = [];
    const source: AudioStreamSource = {
      channels: 1,
      durationSec: DURATION,
      sampleRate: RATE,
      read: async (startSec: number) => {
        readAt.push(startSec);
        return {
          channels: 1,
          sampleRate: RATE,
          samples: new Float32Array(RATE).fill(0.5),
        };
      },
    };

    renderHook(
      () =>
        useAudioStreamPlayback({
          kind: "pcm",
          label: "t",
          playback: true,
          registerRoster: false,
          source,
          trackId: "t",
        }),
      { wrapper },
    );

    // Long enough that a runaway downloader would have taken the lot.
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Some download happens — enough to fill the buffer once. What must not
    // happen is the whole ten seconds arriving while nothing plays.
    expect(Math.max(0, ...readAt)).toBeLessThan(DURATION - 1);
  });
});

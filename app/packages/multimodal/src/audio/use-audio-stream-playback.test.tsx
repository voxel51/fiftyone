import { renderHook, waitFor } from "@testing-library/react";
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
      node: { connect() {}, disconnect() {}, port: {} },
      audioContext: {
        createGain: () => ({
          connect() {},
          disconnect() {},
          gain: { value: 1, setValueAtTime() {}, cancelScheduledValues() {} },
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
      seek() {},
      markEnded() {},
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
  // Reads for playback are paced by the audio buffer emptying. A waveform
  // has to cover the whole source, so it gets its own pass — otherwise,
  // with nothing playing, drawing stopped at the probe plus the buffer
  // (about six seconds) and never grew.
  it("reads the whole source for the waveform even with nothing playing", async () => {
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

    await waitFor(() => expect(readAt.length).toBeGreaterThanOrEqual(10), {
      timeout: 5000,
    });
    expect(Math.max(...readAt)).toBeGreaterThanOrEqual(9);
  });
});

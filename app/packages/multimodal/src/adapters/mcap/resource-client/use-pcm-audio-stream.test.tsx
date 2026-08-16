import {
  PlaybackProvider,
  usePlayback,
  usePlaybackStore,
} from "@fiftyone/playback";
import { getAudioTracks } from "@fiftyone/playback";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VISUALIZATION_KIND } from "../../../ir/index";
import { usePCMAudioStream } from "./use-pcm-audio-stream";

const mocks = vi.hoisted(() => ({ dataStream: null as unknown }));

vi.mock("../../../views/episode/playback/data-stream-context", () => ({
  useDataStream: () => mocks.dataStream,
}));

function rawAudioFrame(timestampNs: bigint, samples: number[]) {
  return {
    output: {
      visualization: {
        channels: 1,
        kind: VISUALIZATION_KIND.RAW_AUDIO,
        sampleRate: 8000,
        samples: Float32Array.from(samples),
      },
    },
    streamId: "audio-1",
    timestampNs,
  };
}

class FakeGainNode {
  gain = { value: 1 };
  numberOfOutputs = 0;
  connect = vi.fn(() => {
    this.numberOfOutputs = 1;
  });
  disconnect = vi.fn();
}

class FakeSourceNode {
  buffer: unknown = null;
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class FakeAudioBuffer {
  duration = 1000;
  private channels: Float32Array[];
  constructor(
    public numberOfChannels: number,
    public length: number,
    public sampleRate: number,
  ) {
    // Built in the constructor body (not a field initializer) so
    // `numberOfChannels`/`length` are already assigned — TS parameter
    // properties are assigned at the top of the constructor body, which
    // runs AFTER class-field initializers, so a field initializer here
    // would see them as still `undefined`.
    this.channels = Array.from(
      { length: numberOfChannels },
      () => new Float32Array(length),
    );
  }
  getChannelData(channel: number) {
    return this.channels[channel];
  }
}

const audioContextInstances: FakeAudioContext[] = [];

class FakeAudioContext {
  currentTime = 0;
  destination = {};
  state: AudioContextState = "running";
  resume = vi.fn(async () => {
    this.state = "running";
  });
  // The hook closes its context on unmount so repeated mounts can't
  // exhaust the browser's per-page AudioContext limit.
  close = vi.fn(async () => {
    this.state = "closed";
  });
  createGain = vi.fn(() => new FakeGainNode());
  createBufferSource = vi.fn(() => new FakeSourceNode());
  createBuffer = vi.fn(
    (channels: number, length: number, sampleRate: number) =>
      new FakeAudioBuffer(channels, length, sampleRate),
  );
  constructor() {
    audioContextInstances.push(this);
  }
}

function renderPcm(streamId = "audio-1") {
  return renderHook(
    () => {
      const store = usePlaybackStore();
      const { play, pause } = usePlayback();
      const result = usePCMAudioStream(streamId);
      return { result, store, play, pause };
    },
    {
      wrapper: ({ children }) => (
        <PlaybackProvider duration={10} stepInterval={1 / 30}>
          {children}
        </PlaybackProvider>
      ),
    },
  );
}

describe("usePCMAudioStream", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "AudioContext",
      FakeAudioContext as unknown as typeof AudioContext,
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    mocks.dataStream = null;
    audioContextInstances.length = 0;
  });

  it("accumulates PCM chunks in time order regardless of read order", async () => {
    mocks.dataStream = {
      getTimelineIndex: () => ({ endTimeNs: 1000n, startTimeNs: 0n }),
      readStreamFrames: vi.fn(async () => ({
        frames: [rawAudioFrame(200n, [3, 4]), rawAudioFrame(0n, [1, 2])],
        stopReason: "complete",
      })),
    };

    const { result } = renderPcm();
    await waitFor(() => expect(result.current.result.status).toBe("ready"));
    expect(result.current.result.hasAudio).toBe(true);
    // One pyramid per channel; this fixture is mono.
    expect(result.current.result.waveformPeaks).toHaveLength(1);
    expect(
      result.current.result.waveformPeaks?.[0].levels[0].min[0],
    ).toBeLessThanOrEqual(1);
  });

  it("marks unsupported when only compressed audio is present (no PCM decode yet)", async () => {
    mocks.dataStream = {
      getTimelineIndex: () => ({ endTimeNs: 1000n, startTimeNs: 0n }),
      readStreamFrames: vi.fn(async () => ({
        frames: [
          {
            output: {
              visualization: {
                bytes: Uint8Array.of(1, 2, 3),
                format: "opus",
                kind: VISUALIZATION_KIND.COMPRESSED_AUDIO,
              },
            },
            streamId: "audio-1",
            timestampNs: 0n,
          },
        ],
        stopReason: "complete",
      })),
    };

    const { result } = renderPcm();
    await waitFor(() =>
      expect(result.current.result.status).toBe("unsupported"),
    );
    expect(result.current.result.hasAudio).toBe(true);
  });

  it("registers the track in the roster once decoded, and registers a PlaybackStream", async () => {
    mocks.dataStream = {
      getTimelineIndex: () => ({ endTimeNs: 1000n, startTimeNs: 0n }),
      readStreamFrames: vi.fn(async () => ({
        frames: [rawAudioFrame(0n, [1, 2, 3, 4])],
        stopReason: "complete",
      })),
    };

    const { result } = renderPcm();
    await waitFor(() => expect(result.current.result.status).toBe("ready"));

    expect(getAudioTracks(result.current.store)).toEqual([
      { id: "audio-1", label: "audio-1", kind: "pcm" },
    ]);
  });

  it("starts a buffer source on play and stops it on pause", async () => {
    mocks.dataStream = {
      getTimelineIndex: () => ({ endTimeNs: 1000n, startTimeNs: 0n }),
      readStreamFrames: vi.fn(async () => ({
        frames: [rawAudioFrame(0n, [1, 2, 3, 4])],
        stopReason: "complete",
      })),
    };

    const { result } = renderPcm();
    await waitFor(() => expect(result.current.result.status).toBe("ready"));

    const audioContext = audioContextInstances[0];

    await act(async () => {
      result.current.play();
    });
    const source = audioContext.createBufferSource.mock.results[0]
      ?.value as FakeSourceNode;
    expect(source.start).toHaveBeenCalled();

    await act(async () => {
      result.current.pause();
    });
    expect(source.stop).toHaveBeenCalled();
  });
});

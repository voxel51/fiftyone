import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  masterMuted: true,
  trackMuted: false,
  isPlaying: false,
  requested: false,
  sources: [{ id: "audio-1", label: "Front mic" }] as Array<{
    id: string;
    label: string;
  }>,
  /** Every `enabled` value `useMcapAudioStream` has been called with. */
  enabledCalls: [] as boolean[],
  /** Every `(sourceId, label)` pair the registrar mounted a stream for. */
  streamCalls: [] as Array<{ sourceId: string; label: string }>,
  registerAudioTrack: vi.fn(() => vi.fn()),
  setAudioAvailable: vi.fn(),
}));

vi.mock("@fiftyone/playback", () => ({
  useAudio: () => ({
    masterMuted: mocks.masterMuted,
    tracks: [{ id: "audio-1", muted: mocks.trackMuted }],
    registerAudioTrack: mocks.registerAudioTrack,
  }),
  useIsPlaying: () => mocks.isPlaying,
  usePlaybackStore: () => ({}),
  setAudioAvailable: mocks.setAudioAvailable,
}));

vi.mock("../../../scene-inventory/react", () => ({
  useOptionalSceneSourcesByType: () => mocks.sources,
}));

vi.mock("../../../audio/audio-source-registry", () => ({
  useAudioDemanded: () => mocks.requested,
  usePublishAudioSourceState: () => undefined,
}));

// The decode path itself is covered by `use-mcap-audio-stream.test.tsx`.
// Here it is a probe: all this test cares about is whether the registrar
// asked it to run.
vi.mock("./use-mcap-audio-stream", () => ({
  useMcapAudioStream: (
    sourceId: string,
    options: { enabled: boolean; label: string },
  ) => {
    mocks.enabledCalls.push(options.enabled);
    mocks.streamCalls.push({ sourceId, label: options.label });
    return { status: "idle", hasAudio: false };
  },
}));

import RegisterMcapAudioStreams from "./RegisterMcapAudioStreams";

/** The `enabled` value from the most recent render. */
function lastEnabled(): boolean {
  return mocks.enabledCalls[mocks.enabledCalls.length - 1];
}

describe("RegisterMcapAudioStreams demand gating", () => {
  beforeEach(() => {
    mocks.masterMuted = true;
    mocks.trackMuted = false;
    mocks.isPlaying = false;
    mocks.requested = false;
    mocks.enabledCalls.length = 0;
    mocks.streamCalls.length = 0;
    mocks.sources = [{ id: "audio-1", label: "Front mic" }];
    mocks.registerAudioTrack.mockClear();
    mocks.setAudioAvailable.mockClear();
  });

  afterEach(cleanup);

  it("stays disabled while muted with nothing requesting it", () => {
    render(<RegisterMcapAudioStreams />);
    expect(lastEnabled()).toBe(false);
  });

  it("enables on request alone, so an Audio tile can draw a waveform while muted and paused", () => {
    mocks.requested = true;
    render(<RegisterMcapAudioStreams />);
    expect(lastEnabled()).toBe(true);
  });

  // The regression this guards: master mute is sessionStorage-scoped and
  // survives sample changes, so an unmute carried into a fresh recording
  // used to start decoding every source before anything asked to hear it.
  it("does not enable on a stale unmute alone, with no tile and nothing played", () => {
    mocks.masterMuted = false;
    render(<RegisterMcapAudioStreams />);
    expect(lastEnabled()).toBe(false);
  });

  it("enables once an unmuted recording is actually played", () => {
    mocks.masterMuted = false;
    const { rerender } = render(<RegisterMcapAudioStreams />);
    expect(lastEnabled()).toBe(false);

    mocks.isPlaying = true;
    rerender(<RegisterMcapAudioStreams />);
    expect(lastEnabled()).toBe(true);
  });

  it("keeps the decoded source across a pause rather than releasing it", () => {
    // The latch is sticky on purpose: gating on `isPlaying` directly would
    // drop the buffer on every pause and force a re-decode on resume.
    mocks.masterMuted = false;
    mocks.isPlaying = true;
    const { rerender } = render(<RegisterMcapAudioStreams />);
    expect(lastEnabled()).toBe(true);

    mocks.isPlaying = false;
    rerender(<RegisterMcapAudioStreams />);
    expect(lastEnabled()).toBe(true);
  });

  // Sashank's case: unmuting is not by itself a reason to keep decoding once
  // the tile that asked for the samples has gone away.
  it("disables when the requesting tile closes, even with the track unmuted", () => {
    mocks.masterMuted = false;
    mocks.requested = true;
    const { rerender } = render(<RegisterMcapAudioStreams />);
    expect(lastEnabled()).toBe(true);

    mocks.requested = false;
    rerender(<RegisterMcapAudioStreams />);
    expect(lastEnabled()).toBe(false);
  });

  it("treats a track muted on its own fader as inaudible even while playing", () => {
    mocks.masterMuted = false;
    mocks.trackMuted = true;
    mocks.isPlaying = true;
    render(<RegisterMcapAudioStreams />);
    expect(lastEnabled()).toBe(false);
  });
});

/**
 * Presence, as distinct from the demand gating above: whether this recording
 * advertises audio at all. Every test in that suite runs with a non-empty
 * source list, so the empty case — by far the common one, since most
 * recordings carry no audio — went uncovered.
 *
 * It reached production as a synthetic "Audio (stub)" track that the
 * registrar mounted whenever a scene had no real audio source, which also
 * pushed `setAudioAvailable(store, "available")`. That single call was what
 * put master volume and the Mixed dropdown on datasets with no audio topics
 * at all (nuscenes, among others). These tests pin the invariant that
 * replaced it: no sources means no audio surface, full stop.
 */
describe("RegisterMcapAudioStreams presence", () => {
  beforeEach(() => {
    mocks.masterMuted = true;
    mocks.trackMuted = false;
    mocks.isPlaying = false;
    mocks.requested = false;
    mocks.enabledCalls.length = 0;
    mocks.streamCalls.length = 0;
    mocks.sources = [{ id: "audio-1", label: "Front mic" }];
    mocks.registerAudioTrack.mockClear();
    mocks.setAudioAvailable.mockClear();
  });

  afterEach(cleanup);

  it("registers no audio track for a recording with no audio sources", () => {
    mocks.sources = [];
    render(<RegisterMcapAudioStreams />);
    expect(mocks.registerAudioTrack).not.toHaveBeenCalled();
  });

  // The specific regression: availability is what the volume control and the
  // Mixed dropdown gate on, so anything that marks a silent recording
  // "available" puts controls on screen that can never do anything.
  it("never marks audio available when there are no audio sources", () => {
    mocks.sources = [];
    render(<RegisterMcapAudioStreams />);
    expect(mocks.setAudioAvailable).not.toHaveBeenCalled();
  });

  it("starts no audio stream when there are no audio sources", () => {
    mocks.sources = [];
    render(<RegisterMcapAudioStreams />);
    expect(mocks.streamCalls).toEqual([]);
  });

  // The registrar mounts beside every scene, including shells rendered
  // without a `SceneInventoryProvider`. No inventory must read as "no audio"
  // rather than taking the shell down.
  it("renders without crashing when there is no scene inventory", () => {
    mocks.sources = [];
    expect(() => render(<RegisterMcapAudioStreams />)).not.toThrow();
  });

  it("mounts one stream per real audio source, passing each label through", () => {
    mocks.sources = [
      { id: "audio-1", label: "Front mic" },
      { id: "audio-2", label: "Cabin mic" },
    ];
    render(<RegisterMcapAudioStreams />);
    expect(mocks.streamCalls).toEqual([
      { sourceId: "audio-1", label: "Front mic" },
      { sourceId: "audio-2", label: "Cabin mic" },
    ]);
  });

  // Labels matter beyond cosmetics: without one the mixer row and tile header
  // fall back to the raw stream id ("0", "1").
  it("stops advertising audio when a sample with sources is replaced by one without", () => {
    const { rerender } = render(<RegisterMcapAudioStreams />);
    expect(mocks.streamCalls).toHaveLength(1);

    mocks.sources = [];
    mocks.streamCalls.length = 0;
    rerender(<RegisterMcapAudioStreams />);
    expect(mocks.streamCalls).toEqual([]);
    expect(mocks.registerAudioTrack).not.toHaveBeenCalled();
  });
});

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
}));

vi.mock("@fiftyone/playback", () => ({
  useAudio: () => ({
    masterMuted: mocks.masterMuted,
    tracks: [{ id: "audio-1", muted: mocks.trackMuted }],
  }),
  useIsPlaying: () => mocks.isPlaying,
  usePlaybackStore: () => ({}),
  setAudioAvailable: vi.fn(),
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
  useMcapAudioStream: (_sourceId: string, options: { enabled: boolean }) => {
    mocks.enabledCalls.push(options.enabled);
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

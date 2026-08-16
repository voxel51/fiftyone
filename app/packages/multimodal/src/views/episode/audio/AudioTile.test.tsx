import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setTileTitle: vi.fn(),
  setHeaderExtra: vi.fn(),
  registerAudioTrack: vi.fn(() => vi.fn()),
  sources: [] as Array<{ id: string; label: string; type: string }>,
  pcmResult: {
    waveformPeaks: null as unknown,
    hasAudio: false,
    decodeStatus: "idle" as string,
  },
}));

vi.mock("@fiftyone/tiling", () => ({
  useSetTileTitle: () => mocks.setTileTitle,
  useSetTileHeaderExtra: () => mocks.setHeaderExtra,
}));

vi.mock("@fiftyone/playback", () => ({
  useAudio: () => ({
    tracks: [],
    registerAudioTrack: mocks.registerAudioTrack,
  }),
  // The tile renders a TimelineRuler; a stub keeps this a unit test of
  // AudioTile's own logic, not the ruler's pan/zoom behavior.
  TimelineRuler: () => <div data-testid="stub-ruler" />,
}));

vi.mock("../../../scene-inventory/react", () => ({
  useSceneSourcesByType: () => mocks.sources,
}));

vi.mock("../../../adapters/mcap/resource-client/use-pcm-audio-stream", () => ({
  usePCMAudioStream: () => mocks.pcmResult,
}));

// AudioTile renders the waveform through `WaveformSurface` (canvas +
// playhead/hover overlay + scrub handling); stubbing it keeps this a unit
// test of AudioTile's own logic.
vi.mock("./WaveformSurface", () => ({
  default: (props: { tracks: Array<{ trackId: string; label: string }> }) => (
    <div data-testid="stub-waveform-viewer">
      {props.tracks.map((t) => (
        <span key={t.trackId}>{t.label}</span>
      ))}
    </div>
  ),
}));

import AudioTile from "./AudioTile";

describe("AudioTile", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.sources = [];
    mocks.pcmResult = { waveformPeaks: null, hasAudio: false, decodeStatus: "idle" };
  });

  it("sets the tile title", () => {
    render(<AudioTile />);
    expect(mocks.setTileTitle).toHaveBeenCalledWith(
      "Audio",
      expect.objectContaining({ source: "auto" }),
    );
  });

  it("renders a metadata header and the waveform viewer against placeholder data when no real source exists", () => {
    render(<AudioTile />);
    expect(screen.getByTestId("audio-tile")).toBeTruthy();
    expect(screen.getByTestId("stub-ruler")).toBeTruthy();
    expect(screen.getByTestId("stub-waveform-viewer")).toBeTruthy();
    expect(screen.getByText(/placeholder/i)).toBeTruthy();
    expect(mocks.registerAudioTrack).toHaveBeenCalledWith(
      expect.objectContaining({ label: "Audio (placeholder)" }),
    );
  });

  it("labels the waveform from a real source when one is available, without registering a placeholder", () => {
    mocks.sources = [{ id: "topic-1", label: "Mic 1", type: "audio" }];
    render(<AudioTile />);
    const metadata = screen.getByTestId("audio-tile").querySelector(".metadata");
    expect(within(metadata as HTMLElement).getByText("Mic 1")).toBeTruthy();
    expect(screen.queryByText(/placeholder/i)).toBeNull();
    expect(mocks.registerAudioTrack).not.toHaveBeenCalled();
  });

  it("shows a decoding status while a real source's PCM hasn't resolved yet", () => {
    mocks.sources = [{ id: "topic-1", label: "Mic 1", type: "audio" }];
    mocks.pcmResult = { waveformPeaks: null, hasAudio: false, decodeStatus: "loading" };
    render(<AudioTile />);
    expect(screen.getByText("Decoding…")).toBeTruthy();
  });

  it("shows an unsupported-codec status when the browser cannot decode it", () => {
    mocks.sources = [{ id: "topic-1", label: "Mic 1", type: "audio" }];
    mocks.pcmResult = { waveformPeaks: null, hasAudio: true, decodeStatus: "unsupported" };
    render(<AudioTile />);
    expect(
      screen.getByText("Audio codec not supported by this browser"),
    ).toBeTruthy();
  });

  it("uses the real decoded peaks once ready, instead of the synthetic placeholder", () => {
    mocks.sources = [{ id: "topic-1", label: "Mic 1", type: "audio" }];
    const realPeaks = { levels: [], samplesPerPeak: 1, sampleRate: 1 };
    mocks.pcmResult = { waveformPeaks: realPeaks, hasAudio: true, decodeStatus: "ready" };
    render(<AudioTile />);
    expect(screen.getByText("Ready")).toBeTruthy();
  });
});

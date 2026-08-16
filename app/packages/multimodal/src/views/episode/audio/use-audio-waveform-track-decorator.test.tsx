import { cleanup, render, screen } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { synthesizePeaks } from "../../../audio/peak-pyramid";

const mocks = vi.hoisted(() => ({
  tracks: [] as Array<{
    id: string;
    label: string;
    muted: boolean;
    setMuted: (m: boolean) => void;
  }>,
}));

vi.mock("@fiftyone/playback", () => ({
  useAudio: () => ({ tracks: mocks.tracks }),
}));

vi.mock("./WaveformViewer", () => ({
  default: (props: { tracks: Array<{ trackId: string; label: string }> }) => (
    <div data-testid="stub-waveform-viewer">{props.tracks[0]?.label}</div>
  ),
}));

import { useAudioMuteTrackDecorator } from "./use-audio-mute-track-decorator";
import { useAudioWaveformTrackDecorator } from "./use-audio-waveform-track-decorator";

describe("useAudioWaveformTrackDecorator", () => {
  afterEach(() => {
    cleanup();
    mocks.tracks = [];
  });

  it("returns an empty override for a track with no matching audio track", () => {
    const peaks = { "audio-1": synthesizePeaks({ durationSec: 1 }) };
    const { result } = renderHook(() => useAudioWaveformTrackDecorator(peaks));
    const decoration = result.current(
      { color: "#fff", events: [], id: "camera_front", label: "Camera Front" },
      false,
    );
    expect(decoration).toEqual({});
  });

  it("returns an empty override when peaks aren't ready yet, even if the audio track exists", () => {
    mocks.tracks = [
      { id: "audio-1", label: "Mic", muted: false, setMuted: vi.fn() },
    ];
    const { result } = renderHook(() => useAudioWaveformTrackDecorator({}));
    const decoration = result.current(
      { color: "#fff", events: [], id: "audio-1", label: "Mic" },
      false,
    );
    expect(decoration).toEqual({});
  });

  it("supplies muted/onMuteClick and a waveform laneOverride once both exist", () => {
    const setMuted = vi.fn();
    mocks.tracks = [{ id: "audio-1", label: "Mic", muted: false, setMuted }];
    const peaks = { "audio-1": synthesizePeaks({ durationSec: 1 }) };
    const { result } = renderHook(() => useAudioWaveformTrackDecorator(peaks));
    const decoration = result.current(
      { color: "#fff", events: [], id: "audio-1", label: "Mic" },
      false,
    );

    expect(decoration.muted).toBe(false);
    decoration.onMuteClick?.();
    expect(setMuted).toHaveBeenCalledWith(true);

    render(<>{decoration.laneOverride}</>);
    expect(screen.getByTestId("stub-waveform-viewer").textContent).toBe("Mic");
  });
});

describe("useAudioMuteTrackDecorator", () => {
  it("swaps the pin button for a mute toggle on matching rows only", () => {
    const setMuted = vi.fn();
    mocks.tracks = [
      { id: "a", label: "A", muted: false, setMuted },
    ] as unknown as typeof mocks.tracks;

    const { result } = renderHook(() => useAudioMuteTrackDecorator());
    const decorated = result.current(
      { id: "a", label: "A", color: "#fff", events: [] },
      false,
    );
    expect(decorated.muted).toBe(false);
    decorated.onMuteClick?.();
    expect(setMuted).toHaveBeenCalledWith(true);

    // A row with no matching audio track keeps its pin button.
    expect(
      result.current(
        { id: "other", label: "O", color: "#fff", events: [] },
        false,
      ),
    ).toEqual({});
  });

  it("adds no lane override, unlike the waveform decorator", () => {
    mocks.tracks = [
      { id: "a", label: "A", muted: true, setMuted: vi.fn() },
    ] as unknown as typeof mocks.tracks;
    const { result } = renderHook(() => useAudioMuteTrackDecorator());
    const decorated = result.current(
      { id: "a", label: "A", color: "#fff", events: [] },
      false,
    );
    expect(decorated.laneOverride).toBeUndefined();
    expect(decorated.muted).toBe(true);
  });
});

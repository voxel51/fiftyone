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

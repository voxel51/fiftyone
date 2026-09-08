import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setTileTitle: vi.fn(),
  setHeaderExtra: vi.fn(),
  registerAudioTrack: vi.fn(() => vi.fn()),
  sources: [] as Array<{
    id: string;
    label: string;
    sourceName: string;
    type: string;
  }>,
  waveformTracks: [] as Array<{ pyramid: unknown }>,
  pcmResult: {
    waveformPeaks: null as unknown,
    hasAudio: false,
    status: "idle" as string,
  },
}));

vi.mock("@fiftyone/tiling", () => ({
  useSetTileTitle: () => mocks.setTileTitle,
  useSetTileHeaderExtra: () => mocks.setHeaderExtra,
  useTileId: () => "audio-tile-1",
}));

// The tile publishes a source picker to the sidebar; registering it needs a
// provider this unit test has no reason to mount.
vi.mock("../tiles/tile-settings-context", () => ({
  useRegisterTileSettings: () => undefined,
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

// The tile observes the shared per-source state now rather than starting
// its own reader, so that is what this stubs.
vi.mock("../../../audio/audio-source-registry", () => ({
  useAudioSourceState: () => mocks.pcmResult,
  useRequestAudio: () => undefined,
}));

// AudioTile renders the waveform through `WaveformSurface` (canvas +
// playhead/hover overlay + scrub handling); stubbing it keeps this a unit
// test of AudioTile's own logic.
vi.mock("./WaveformSurface", () => ({
  default: (props: {
    tracks: Array<{ trackId: string; label: string; pyramid: unknown }>;
  }) => (
    <div
      data-testid="stub-waveform-viewer"
      ref={() => {
        mocks.waveformTracks = props.tracks;
      }}
    >
      {props.tracks.map((t) => (
        <span key={t.trackId}>{t.label}</span>
      ))}
    </div>
  ),
}));

import { semanticSourceKey } from "../settings/semantic-source";
import { updateSidebarPreferences } from "../settings/sidebar-preferences";
import { SidebarPreferencesProvider } from "../settings/sidebar-preferences-context";
import AudioTile from "./AudioTile";

describe("AudioTile", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.sources = [];
    mocks.pcmResult = { waveformPeaks: null, hasAudio: false, status: "idle" };
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
    mocks.sources = [
      { id: "topic-1", label: "Mic 1", sourceName: "/mic_1", type: "audio" },
    ];
    render(<AudioTile />);
    // Query by testid, not a CSS-module class: those are hashed in a real
    // build, so `.metadata` matches nothing outside the local dev config.
    const metadata = screen.getByTestId("audio-tile-metadata");
    expect(within(metadata).getByText("Mic 1")).toBeTruthy();
    expect(screen.queryByText(/placeholder/i)).toBeNull();
    expect(mocks.registerAudioTrack).not.toHaveBeenCalled();
  });

  it("shows a decoding status while a real source's PCM hasn't resolved yet", () => {
    mocks.sources = [
      { id: "topic-1", label: "Mic 1", sourceName: "/mic_1", type: "audio" },
    ];
    mocks.pcmResult = {
      waveformPeaks: null,
      hasAudio: false,
      status: "loading",
    };
    render(<AudioTile />);
    expect(screen.getByText("Decoding…")).toBeTruthy();
  });

  it("shows an unsupported-codec status when the browser cannot decode it", () => {
    mocks.sources = [
      { id: "topic-1", label: "Mic 1", sourceName: "/mic_1", type: "audio" },
    ];
    mocks.pcmResult = {
      waveformPeaks: null,
      hasAudio: true,
      status: "unsupported",
    };
    render(<AudioTile />);
    expect(
      screen.getByText("Audio codec not supported by this browser"),
    ).toBeTruthy();
  });

  it("uses the real decoded peaks once ready, instead of the synthetic placeholder", () => {
    mocks.sources = [
      { id: "topic-1", label: "Mic 1", sourceName: "/mic_1", type: "audio" },
    ];
    const realPeaks = [{ levels: [], samplesPerPeak: 1, sampleRate: 1 }];
    mocks.pcmResult = {
      waveformPeaks: realPeaks,
      hasAudio: true,
      status: "ready",
    };
    render(<AudioTile />);
    expect(screen.getByText("Ready")).toBeTruthy();
    // Asserting the caption alone would still pass if the tile kept
    // feeding the synthetic placeholder to the waveform.
    expect(mocks.waveformTracks[0]?.pyramid).toBe(realPeaks[0]);
  });

  // Runtime source ids are positional and get reassigned per recording, and
  // the playback shell stays mounted across sample navigation — so the tile
  // has to re-resolve from its persisted semantic key rather than trusting
  // the id it bound at mount.
  describe("across sample navigation", () => {
    const SCOPE = "dataset-1";
    const micFront = { label: "Mic Front", sourceName: "/mic_front" };
    const micRear = { label: "Mic Rear", sourceName: "/mic_rear" };
    const audio = (
      id: string,
      source: { label: string; sourceName: string },
    ) => ({ id, type: "audio", ...source });

    afterEach(() => {
      globalThis.localStorage.clear();
    });

    const renderScoped = (
      sources: ReturnType<typeof audio>[],
      initialSourceId?: string,
    ) => {
      mocks.sources = sources;
      return render(
        <SidebarPreferencesProvider scopeKey={SCOPE} sources={sources}>
          <AudioTile initialSourceId={initialSourceId} />
        </SidebarPreferencesProvider>,
      );
    };

    const headerLabel = () =>
      screen.getByTestId("audio-tile-metadata").textContent ?? "";

    it("follows its persisted source into the next sample even when the runtime ids move", () => {
      updateSidebarPreferences(SCOPE, (current) => ({
        ...current,
        tiles: {
          ...current.tiles,
          "audio-tile-1": {
            audioSourceKey: semanticSourceKey({
              sourceName: micRear.sourceName,
              type: "audio",
            }),
          },
        },
      }));

      // Same two topics as the previous sample, reassigned ids — and the
      // preferred one is no longer first in the list.
      renderScoped([audio("7", micFront), audio("9", micRear)]);

      expect(headerLabel()).toContain("Mic Rear");
    });

    it("re-resolves when a new sample's inventory replaces the ids it bound at mount", () => {
      updateSidebarPreferences(SCOPE, (current) => ({
        ...current,
        tiles: {
          ...current.tiles,
          "audio-tile-1": {
            audioSourceKey: semanticSourceKey({
              sourceName: micRear.sourceName,
              type: "audio",
            }),
          },
        },
      }));
      const { rerender } = renderScoped(
        [audio("1", micFront), audio("2", micRear)],
        "2",
      );
      expect(headerLabel()).toContain("Mic Rear");

      const nextSample = [audio("4", micFront), audio("5", micRear)];
      mocks.sources = nextSample;
      rerender(
        <SidebarPreferencesProvider scopeKey={SCOPE} sources={nextSample}>
          <AudioTile initialSourceId="2" />
        </SidebarPreferencesProvider>,
      );

      // Before the fix this fell through to `sources[0]` — "Mic Front".
      expect(headerLabel()).toContain("Mic Rear");
    });

    it("falls back to the first source when the persisted topic is absent from this sample", () => {
      updateSidebarPreferences(SCOPE, (current) => ({
        ...current,
        tiles: {
          ...current.tiles,
          "audio-tile-1": {
            audioSourceKey: semanticSourceKey({
              sourceName: "/mic_gone",
              type: "audio",
            }),
          },
        },
      }));

      renderScoped([audio("1", micFront), audio("2", micRear)]);

      expect(headerLabel()).toContain("Mic Front");
    });
  });
});

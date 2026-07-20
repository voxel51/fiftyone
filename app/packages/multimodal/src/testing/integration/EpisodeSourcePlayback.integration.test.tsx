import { PlaybackProvider } from "@fiftyone/playback";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFixtureFormatAdapter } from "../../adapters/fixture";
import { STREAM_KIND, type RawImageVisualization } from "../../ir";
import type { ByteResources, EpisodeSource } from "../../ports";
import { SceneInventoryProvider } from "../../scene-inventory";
import { EpisodeSourcePlayback } from "../../views/episode";
import { useEpisodeStreamValue } from "../../views/episode/playback/use-episode-stream-values";

const layout = vi.hoisted(() => ({
  defaultLeftOpen: false,
  defaultLeftSidebarWidth: undefined,
  defaultTrackingMode: "free",
  initialExpandedTileId: null,
  initialLayout: undefined,
  initialManualTileTitles: {},
  initialTiles: {},
  onDefaultTrackingModeChange: vi.fn(),
  onLeftOpenChange: vi.fn(),
  onLeftSidebarWidthChange: vi.fn(),
  onPreferredCameraTargetFrameIdChange: vi.fn(),
  onPreferredWorldFrameIdChange: vi.fn(),
  onSceneUpAxisChange: vi.fn(),
  preferredCameraTargetFrameId: null,
  preferredWorldFrameId: null,
  resetTiles: vi.fn(),
  sceneUpAxis: "z",
}));

vi.mock("../../components/MultiModalPlayback/MultiModalPlayback", () => ({
  default: ({
    children,
    sceneSources = [],
  }: {
    readonly children?: ReactNode;
    readonly sceneSources?: readonly {
      id: string;
      label: string;
      type: string;
    }[];
  }) => (
    <PlaybackProvider duration={0.3}>
      <SceneInventoryProvider sources={sceneSources}>
        <div data-testid="fixture-modal-shell">{children}</div>
      </SceneInventoryProvider>
    </PlaybackProvider>
  ),
}));

vi.mock("../../views/episode/tiles/EpisodeAddTileMenu", () => ({
  default: () => null,
}));
vi.mock("../../views/episode/scene/EpisodeInspectorSidebar", () => ({
  default: () => null,
}));
vi.mock("../../views/episode/shell/EpisodeNetworkStatus", () => ({
  EpisodeNetworkHealthTracker: () => null,
  EpisodeNetworkStatusPill: () => null,
}));
vi.mock("../../views/episode/playback/EpisodePausedByteBanking", () => ({
  EpisodePausedByteBanking: () => null,
}));
vi.mock("../../views/episode/settings/EpisodeSettingsSidebar", () => ({
  default: () => null,
}));
vi.mock("../../views/episode/playback/EpisodeTimestampReadout", () => ({
  default: () => null,
}));
vi.mock("../../views/episode/scene/episode-selected-object", () => ({
  EpisodeSelectionHotkeys: () => null,
}));
vi.mock("../../views/episode/layout/use-episode-modal-layout", () => ({
  EpisodeModalLayoutPersistence: () => null,
  useEpisodeModalLayout: () => layout,
}));
vi.mock("../../views/episode/tiles/use-episode-tiles", () => ({
  useEpisodeTiles: () => undefined,
}));

const source: EpisodeSource = {
  assets: {
    list: async () => [],
    resolve: async () => {
      throw new Error("Fixture adapter has no physical assets");
    },
  },
  episodeId: "fixture-modal",
};

const io: ByteResources = {
  readBytes: async () => {
    throw new Error("Fixture adapter has no physical bytes");
  },
};

afterEach(cleanup);

describe("fixture adapter through the production modal playback host", () => {
  it("discovers fixture scene sources and renders image data through mandatory reads", async () => {
    const session = await createFixtureFormatAdapter().open(source, io);
    const byteSource = {
      sourceId: "fixture-modal",
      url: "memory://fixture-modal",
    } as const;
    try {
      render(
        <EpisodeSourcePlayback
          fileName="fixture"
          session={session}
          source={byteSource}
        >
          <FixtureImageProbe />
        </EpisodeSourcePlayback>,
      );

      expect(screen.getByTestId("fixture-modal-shell")).toBeTruthy();
      await waitFor(() => {
        expect(screen.getByTestId("fixture-modal-image").textContent).toBe(
          "raw-image",
        );
      });
      expect(session.stats?.().readRequests).toBeGreaterThan(0);
    } finally {
      session.dispose();
    }
  });
});

function FixtureImageProbe() {
  const frame = useEpisodeStreamValue<RawImageVisualization>(
    `fixture-${STREAM_KIND.IMAGE}`,
  );
  return (
    <span data-testid="fixture-modal-image">{frame?.kind ?? "pending"}</span>
  );
}

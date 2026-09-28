import { PlaybackProvider } from "@fiftyone/playback";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFixtureFormatAdapter } from "../../adapters/fixture";
import { STREAM_KIND, type RawImageVisualization } from "../../ir";
import type { ByteResources, EpisodeSource } from "../../ports";
import { SceneInventoryProvider } from "../../scene-inventory/react";
import { SourcePlayback } from "../../views/episode";
import { usePlaybackStreamValue } from "../../views/episode/playback/use-stream-values";

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
  onTimelineSamplingRateChange: vi.fn(),
  preferredCameraTargetFrameId: null,
  preferredWorldFrameId: null,
  resetTiles: vi.fn(),
  sceneUpAxis: "z",
  timelineSamplingRateHz: 30,
}));

vi.mock("../../views/episode/shell/PlaybackShell", () => ({
  default: ({
    children,
    sceneSources = [],
  }: {
    readonly children?: ReactNode;
    readonly sceneSources?: readonly {
      id: string;
      label: string;
      sourceName: string;
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

vi.mock("../../views/episode/shell/AddTileMenu", () => ({
  default: () => null,
}));
vi.mock("../../views/episode/shell/RightSidebarWithTrays", () => ({
  default: () => null,
}));
vi.mock("../../views/episode/shell/NetworkStatus", () => ({
  NetworkHealthTracker: () => null,
  NetworkStatusPill: () => null,
}));
vi.mock("../../views/episode/settings/modal/SettingsSidebar", () => ({
  default: () => null,
}));
vi.mock("../../views/episode/playback/TimestampReadout", () => ({
  default: () => null,
}));
vi.mock("../../views/episode/interaction/selection/selected-object", () => ({
  SelectionHotkeys: () => null,
}));
vi.mock("../../views/episode/layout/use-modal-layout", () => ({
  ModalLayoutPersistence: () => null,
  useModalLayout: () => layout,
}));
vi.mock("../../views/episode/shell/use-register-tiles", () => ({
  useRegisterTiles: () => undefined,
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
        <SourcePlayback
          fileName="fixture"
          session={session}
          source={byteSource}
        >
          <FixtureImageProbe />
        </SourcePlayback>,
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
  const frame = usePlaybackStreamValue<RawImageVisualization>(
    `fixture-${STREAM_KIND.IMAGE}`,
  );
  return (
    <span data-testid="fixture-modal-image">{frame?.kind ?? "pending"}</span>
  );
}

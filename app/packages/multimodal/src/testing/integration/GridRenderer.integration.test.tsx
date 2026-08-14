import type { SampleRendererProps } from "@fiftyone/plugins";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFixtureFormatAdapter } from "../../adapters/fixture";
import type {
  ByteResources,
  EpisodePreviewSession,
  EpisodeSource,
} from "../../ports";
import { GridRenderer } from "../../views/episode";
import {
  getGridPosterCache,
  gridPosterCacheKey,
  resetGridPosterCacheForTests,
} from "../../views/episode/grid/grid-poster-cache";

const harness = vi.hoisted(() => ({
  byteSource: {
    sourceId: "fixture-grid",
    url: "memory://fixture-grid",
  },
  cameraSetter: vi.fn(),
  episodeSource: null as EpisodeSource | null,
  previewSession: null as EpisodePreviewSession | null,
  registerStreams: vi.fn(),
  sessionEnabled: [] as boolean[],
}));

vi.mock("../../views/session/use-stable-episode-source", () => ({
  useStableEpisodeSource: () => ({
    byteSource: harness.byteSource,
    episodeSource: harness.episodeSource,
  }),
}));

vi.mock("../../views/session/use-episode-preview-session", () => ({
  useEpisodePreviewSession: (
    _sample: unknown,
    _source: unknown,
    enabled: boolean,
  ) => {
    harness.sessionEnabled.push(enabled);
    return enabled
      ? {
          error: null,
          session: harness.previewSession,
          status: "ready",
        }
      : { error: null, session: null, status: "idle" };
  },
}));

vi.mock("../../views/episode/grid/grid-stream-state", () => ({
  GRID_STREAM_AUTO: "__auto__",
  useGridSelectedStream: () => ["__auto__", vi.fn()],
  useRegisterGridStreams: () => harness.registerStreams,
}));

vi.mock("../../views/episode/grid/grid-camera-state", () => ({
  useGridCameraPose: () => [null, harness.cameraSetter],
}));

vi.mock("../../visualization/media-2d/BitmapImageView", () => ({
  BitmapCanvasHost: () => <div data-testid="fixture-grid-point-cloud" />,
  BitmapImageView: () => <div data-testid="fixture-grid-cached-image" />,
  BitmapImageFrameView: () => <div data-testid="fixture-grid-image" />,
}));

vi.mock("../../visualization/composition", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../visualization/composition")>()),
  PointCloudPanel: () => <div data-testid="fixture-grid-live-point-cloud" />,
}));

vi.mock("../../visualization/scene-3d/gpu/webgpu-snapshot-renderer", () => ({
  renderPointCloudSnapshot: vi.fn(async () => null),
}));

const episodeSource: EpisodeSource = {
  assets: {
    list: async () => [],
    resolve: async () => {
      throw new Error("Fixture adapter has no physical assets");
    },
  },
  episodeId: "fixture-grid",
};

const io: ByteResources = {
  readBytes: async () => {
    throw new Error("Fixture adapter has no physical bytes");
  },
};

afterEach(() => {
  cleanup();
  harness.previewSession?.dispose();
  harness.previewSession = null;
  harness.episodeSource = null;
  harness.cameraSetter.mockReset();
  harness.registerStreams.mockReset();
  harness.sessionEnabled.length = 0;
  resetGridPosterCacheForTests();
});

describe("fixture adapter through the production grid renderer", () => {
  it("loads and renders a fixture preview through the preview-session port", async () => {
    harness.episodeSource = episodeSource;
    harness.previewSession =
      (await createFixtureFormatAdapter().openPreview?.(episodeSource, io)) ??
      null;
    if (!harness.previewSession) {
      throw new Error("Fixture preview session did not open");
    }
    const read = vi.spyOn(harness.previewSession, "read");

    render(<GridRenderer ctx={rendererContext()} />);

    await waitFor(() => {
      expect(screen.getByTestId("fixture-grid-image")).toBeTruthy();
    });
    expect(read).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ priority: "idle" }),
    );
  });

  it("hydrates a remounted tile without opening or reading its preview session", async () => {
    harness.episodeSource = episodeSource;
    harness.previewSession =
      (await createFixtureFormatAdapter().openPreview?.(episodeSource, io)) ??
      null;
    if (!harness.previewSession) {
      throw new Error("Fixture preview session did not open");
    }
    const read = vi.spyOn(harness.previewSession, "read");
    resetGridPosterCacheForTests({ maxSizeBytes: 10_000 });
    const key = gridPosterCacheKey({
      datasetId: "fixture-dataset",
      mediaField: "recording",
      selectedSourceName: null,
      source: harness.byteSource,
    });
    getGridPosterCache().put(key, {
      bytes: new Uint8Array([1, 2, 3]),
      height: 100,
      mimeType: "image/webp",
      sourceKind: "image",
      streamId: "fixture-camera",
      streamSourceName: "/fixture/camera",
      streamSourceNames: ["/fixture/camera"],
      width: 100,
    });

    const first = render(<GridRenderer ctx={rendererContext()} />);
    await waitFor(() => {
      expect(screen.getByTestId("fixture-grid-cached-image")).toBeTruthy();
    });
    first.unmount();
    const remounted = render(<GridRenderer ctx={rendererContext()} />);
    await waitFor(() => {
      expect(screen.getByTestId("fixture-grid-cached-image")).toBeTruthy();
    });

    expect(read).not.toHaveBeenCalled();
    expect(harness.sessionEnabled.every((enabled) => enabled === false)).toBe(
      true,
    );
    expect(getGridPosterCache().stats().hits).toBe(2);

    fireEvent.pointerEnter(remounted.container.firstElementChild as Element);
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    expect(read).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ priority: "current" }),
    );
    await act(async () => {
      fireEvent.pointerLeave(remounted.container.firstElementChild as Element);
      fireEvent.pointerEnter(remounted.container.firstElementChild as Element);
      await Promise.resolve();
    });
    expect(read).toHaveBeenCalledTimes(1);
  });
});

function rendererContext(): SampleRendererProps["ctx"] {
  return {
    dataset: {
      datasetId: "fixture-dataset",
      mediaType: "multimodal",
      name: "fixture-dataset",
    },
    media: { field: "recording", path: "memory://fixture-grid" },
    sample: { sample: { _id: "fixture-grid" } },
  } as SampleRendererProps["ctx"];
}

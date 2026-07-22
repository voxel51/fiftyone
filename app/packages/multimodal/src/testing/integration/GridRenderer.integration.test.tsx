import type { SampleRendererProps } from "@fiftyone/plugins";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFixtureFormatAdapter } from "../../adapters/fixture";
import type {
  ByteResources,
  EpisodePreviewSession,
  EpisodeSource,
} from "../../ports";
import { GridRenderer } from "../../views/episode";

const harness = vi.hoisted(() => ({
  byteSource: {
    sourceId: "fixture-grid",
    url: "memory://fixture-grid",
  },
  cameraSetter: vi.fn(),
  episodeSource: null as EpisodeSource | null,
  previewSession: null as EpisodePreviewSession | null,
  registerStreams: vi.fn(),
}));

vi.mock("../../views/session/use-stable-episode-source", () => ({
  useStableEpisodeSource: () => ({
    byteSource: harness.byteSource,
    episodeSource: harness.episodeSource,
  }),
}));

vi.mock("../../views/session/use-episode-preview-session", () => ({
  useEpisodePreviewSession: () => ({
    error: null,
    session: harness.previewSession,
    status: "ready",
  }),
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

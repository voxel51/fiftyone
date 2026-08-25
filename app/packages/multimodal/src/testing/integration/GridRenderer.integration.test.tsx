import type { SampleRendererProps } from "@fiftyone/plugins";
import { multimodalGridFit } from "@fiftyone/state";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecoilRoot, useSetRecoilState } from "recoil";
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
import { H264_REORDERED_DECODE_LOOKAHEAD_NS } from "../../video/stream-engine";

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
  BitmapImageView: ({
    bytes,
    fit,
  }: {
    bytes: Uint8Array;
    fit: "contain" | "cover";
  }) => (
    <div
      data-fit={fit}
      data-first-byte={bytes[0]}
      data-testid="fixture-grid-cached-image"
    />
  ),
  BitmapImageFrameView: ({ fit }: { fit: "contain" | "cover" }) => (
    <div data-fit={fit} data-testid="fixture-grid-image" />
  ),
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
    const read = await openFixturePreview();

    renderGrid();

    await waitFor(() => {
      expect(screen.getByTestId("fixture-grid-image")).toBeTruthy();
    });
    expect(read).toHaveBeenCalledWith(
      { decodeLookaheadNs: H264_REORDERED_DECODE_LOOKAHEAD_NS },
      expect.objectContaining({ priority: "idle" }),
    );
  });

  it("hydrates a remounted tile without opening or reading its preview session", async () => {
    const read = await openFixturePreview();
    resetGridPosterCacheForTests({ maxSizeBytes: 10_000 });
    cacheFixturePoster("cover", [1, 2, 3]);

    const first = renderGrid();
    await waitFor(() => {
      expect(screen.getByTestId("fixture-grid-cached-image")).toBeTruthy();
    });
    first.unmount();
    const remounted = renderGrid();
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
      { decodeLookaheadNs: H264_REORDERED_DECODE_LOOKAHEAD_NS },
      expect.objectContaining({ priority: "current" }),
    );
    await act(async () => {
      fireEvent.pointerLeave(remounted.container.firstElementChild as Element);
      fireEvent.pointerEnter(remounted.container.firstElementChild as Element);
      await Promise.resolve();
    });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("reuses fit-specific posters without reopening the preview session", async () => {
    const read = await openFixturePreview();
    resetGridPosterCacheForTests({ maxSizeBytes: 10_000 });
    for (const [fit, firstByte] of [
      ["cover", 1],
      ["contain", 2],
    ] as const) {
      cacheFixturePoster(fit, [firstByte]);
    }

    renderGridWithFitControls();

    await expectCachedFit("cover", "1");
    fireEvent.click(screen.getByRole("button", { name: "use contain" }));
    await expectCachedFit("contain", "2");
    fireEvent.click(screen.getByRole("button", { name: "use cover" }));
    await expectCachedFit("cover", "1");

    expect(read).not.toHaveBeenCalled();
    expect(harness.sessionEnabled.every((enabled) => enabled === false)).toBe(
      true,
    );
    expect(getGridPosterCache().stats().entryCount).toBe(2);
  });

  it("retains a loaded frame when an uncached fit is selected", async () => {
    const read = await openFixturePreview();
    resetGridPosterCacheForTests({ maxSizeBytes: 10_000 });
    cacheFixturePoster("cover", [1]);

    renderGridWithFitControls();
    const poster = await screen.findByTestId("fixture-grid-cached-image");
    const root = poster.parentElement;
    if (!root) throw new Error("Expected the grid renderer root");

    fireEvent.pointerEnter(root);
    await waitFor(() => {
      expect(read).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("fixture-grid-image").dataset.fit).toBe(
        "cover",
      );
    });
    fireEvent.pointerLeave(root);
    fireEvent.click(screen.getByRole("button", { name: "use contain" }));

    await waitFor(() => {
      expect(screen.getByTestId("fixture-grid-image").dataset.fit).toBe(
        "contain",
      );
    });
    expect(read).toHaveBeenCalledTimes(1);
  });
});

function renderGrid() {
  return render(
    <RecoilRoot>
      <GridRenderer ctx={rendererContext()} />
    </RecoilRoot>,
  );
}

function renderGridWithFitControls() {
  return render(
    <RecoilRoot>
      <FitControls />
      <GridRenderer ctx={rendererContext()} />
    </RecoilRoot>,
  );
}

function FitControls() {
  const setFit = useSetRecoilState(multimodalGridFit);
  return (
    <>
      <button onClick={() => setFit("contain")} type="button">
        use contain
      </button>
      <button onClick={() => setFit("cover")} type="button">
        use cover
      </button>
    </>
  );
}

async function expectCachedFit(fit: "contain" | "cover", firstByte: string) {
  await waitFor(() => {
    const image = screen.getByTestId("fixture-grid-cached-image");
    expect(image.dataset.fit).toBe(fit);
    expect(image.dataset.firstByte).toBe(firstByte);
  });
}

async function openFixturePreview() {
  harness.episodeSource = episodeSource;
  harness.previewSession =
    (await createFixtureFormatAdapter().openPreview?.(episodeSource, io)) ??
    null;
  if (!harness.previewSession) {
    throw new Error("Fixture preview session did not open");
  }
  return vi.spyOn(harness.previewSession, "read");
}

function cacheFixturePoster(
  fit: "contain" | "cover",
  bytes: readonly number[],
) {
  getGridPosterCache().put(
    gridPosterCacheKey({
      datasetId: "fixture-dataset",
      imageFit: fit,
      mediaField: "recording",
      selectedSourceName: null,
      source: harness.byteSource,
    }),
    {
      bytes: new Uint8Array(bytes),
      height: 100,
      mimeType: "image/webp",
      sourceKind: "image",
      streamId: "fixture-camera",
      streamSourceName: "/fixture/camera",
      streamSourceNames: ["/fixture/camera"],
      width: 100,
    },
  );
}

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

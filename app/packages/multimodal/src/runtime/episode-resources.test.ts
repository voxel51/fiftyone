import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EpisodeManifest } from "../ir";
import type { EpisodeSource, EpisodeSourceHints } from "../ports";
import {
  openEpisodePreviewSession,
  openEpisodeSession,
} from "./episode-resources";

const resourceHarness = vi.hoisted(() => ({
  byteResources: { read: vi.fn() },
  loadFormatAdapter: vi.fn(),
}));

vi.mock("../query/bytes", () => ({
  byteSourceAccessKey: vi.fn(),
  createDefaultByteClient: () => resourceHarness.byteResources,
}));

vi.mock("./adapter-registry", () => ({
  loadFormatAdapter: resourceHarness.loadFormatAdapter,
}));

describe("episode resources", () => {
  beforeEach(() => {
    resourceHarness.loadFormatAdapter.mockReset();
  });

  it("propagates cancellation options to a preview adapter", async () => {
    const preview = { dispose: vi.fn() };
    const openPreview = vi.fn().mockResolvedValue(preview);
    resourceHarness.loadFormatAdapter.mockResolvedValue({
      id: "test",
      open: vi.fn(),
      openPreview,
    });
    const source = createSource();
    const controller = new AbortController();

    await openEpisodePreviewSession(
      { mediaType: "group", path: "sample.mcap" },
      source,
      { signal: controller.signal },
    );

    expect(resourceHarness.loadFormatAdapter).toHaveBeenCalledWith(
      { mediaType: "group", path: "sample.mcap" },
      { signal: controller.signal },
    );
    expect(openPreview).toHaveBeenCalledWith(
      source,
      resourceHarness.byteResources,
      { signal: controller.signal },
    );
  });

  it("loads the adapter and durable hints concurrently, then opens once", async () => {
    let finishAdapter!: (adapter: {
      id: string;
      open: ReturnType<typeof vi.fn>;
    }) => void;
    let finishHints!: (hints: EpisodeSourceHints) => void;
    const open = vi.fn().mockResolvedValue({ dispose: vi.fn() });
    resourceHarness.loadFormatAdapter.mockImplementation(
      () =>
        new Promise<{ id: string; open: ReturnType<typeof vi.fn> }>(
          (resolve) => {
            finishAdapter = resolve;
          },
        ),
    );
    const resolveHints = vi.fn(
      () =>
        new Promise<EpisodeSourceHints>((resolve) => {
          finishHints = resolve;
        }),
    );
    const source = { ...createSource(), resolveHints };

    const pending = openEpisodeSession(
      { mediaType: "multimodal", path: "sample.mcap" },
      source,
    );

    expect(resourceHarness.loadFormatAdapter).toHaveBeenCalledTimes(1);
    expect(resolveHints).toHaveBeenCalledTimes(1);
    finishAdapter({ id: "mcap", open });
    finishHints({
      adapterId: "mcap",
      manifestHint: createManifest("sample-a"),
    });
    await pending;

    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({
        episodeId: "sample-a",
        manifestHint: createManifest("sample-a"),
      }),
      resourceHarness.byteResources,
      undefined,
    );
    expect(open.mock.calls[0]?.[0]).not.toHaveProperty("resolveHints");
  });

  it("discards hint bundles produced for a different adapter", async () => {
    const open = vi.fn().mockResolvedValue({ dispose: vi.fn() });
    resourceHarness.loadFormatAdapter.mockResolvedValue({ id: "mcap", open });
    const source = {
      ...createSource(),
      resolveHints: vi.fn(async () => ({
        adapterId: "fixture",
        manifestHint: createManifest("wrong-adapter"),
      })),
    };

    await openEpisodeSession(
      { mediaType: "multimodal", path: "sample.mcap" },
      source,
    );

    expect(open.mock.calls[0]?.[0]).not.toHaveProperty("manifestHint");
  });
});

function createSource(): EpisodeSource {
  return {
    assets: {
      list: vi.fn(async () => []),
      resolve: vi.fn(),
    },
    episodeId: "sample-a",
  };
}

function createManifest(episodeId: string): EpisodeManifest {
  return {
    episodeId,
    streams: [],
    timeDomain: { id: "log", kind: "timestamp" },
    timeRange: { endNs: 1n, startNs: 0n },
  };
}

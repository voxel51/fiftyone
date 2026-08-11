import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EpisodeSource } from "../ports";
import { openEpisodePreviewSession } from "./episode-resources";

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

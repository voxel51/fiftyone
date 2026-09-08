import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ByteSourceDescriptor } from "../../../ir";
import {
  peekSourceBootstrap,
  publishSourceBootstrap,
  resetSourceBootstrapCacheForTests,
} from "../../../runtime/source-bootstrap-cache";
import {
  SOURCE_FACTS_SCHEMA_VERSION,
  sourceFactsIdentity,
  type SourceFactsScope,
} from "../../../runtime/source-facts";
import {
  resetSourceFactsPersistenceForTests,
  type SourceFactsPersistence,
} from "../../../runtime/source-facts-persistence";
import { resetSourceFactsServiceForTests } from "../../../runtime/source-facts-service";
import {
  getEpisodeTimeRange,
  resetEpisodeTimeRangesForTests,
} from "../../../runtime/episode-time-range-registry";
import type { GridPosterCacheEntry } from "./grid-poster-cache";
import { useHydratedSourceFacts } from "./use-hydrated-source-facts";

const SCOPE: SourceFactsScope = {
  cachePartition: "partition",
  datasetId: "dataset",
  mediaField: null,
};

const SOURCE: ByteSourceDescriptor = {
  sourceId: "episode-a",
  url: "https://app.example/media?filepath=%2Fdata%2Frun.mcap",
};

const PERSISTED_RANGE = { endNs: 2_000n, startNs: 1_000n };

describe("useHydratedSourceFacts", () => {
  let persistence: SourceFactsPersistence;

  beforeEach(() => {
    resetEpisodeTimeRangesForTests();
    resetSourceBootstrapCacheForTests();
    resetSourceFactsServiceForTests();
    persistence = {
      clear: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
      get: vi.fn(async () => ({
        adapterId: "mcap",
        createdAt: 1,
        facts: { timeRange: PERSISTED_RANGE },
        identity: sourceFactsIdentity(SOURCE),
        scope: SCOPE,
        version: SOURCE_FACTS_SCHEMA_VERSION,
      })),
      put: vi.fn(async () => ({ byteLength: 10, stored: true })),
    };
    resetSourceFactsPersistenceForTests(persistence);
  });

  afterEach(() => {
    resetEpisodeTimeRangesForTests();
    resetSourceBootstrapCacheForTests();
    resetSourceFactsPersistenceForTests();
  });

  it("publishes the recording range for a tile served from the poster cache", async () => {
    renderHook(() => useHydratedSourceFacts(cachedTile()));

    await vi.waitFor(() =>
      expect(peekSourceBootstrap(SOURCE)?.timeRange).toEqual(PERSISTED_RANGE),
    );
  });

  it("shares the hydrated range with the episode's other lanes", async () => {
    renderHook(() => useHydratedSourceFacts(cachedTile()));

    await vi.waitFor(() =>
      expect(getEpisodeTimeRange(SOURCE.sourceId)).toEqual(PERSISTED_RANGE),
    );
  });

  it("reads persisted facts once for a tile that re-renders", async () => {
    const { rerender } = renderHook(() => useHydratedSourceFacts(cachedTile()));

    await vi.waitFor(() => expect(persistence.get).toHaveBeenCalledTimes(1));
    rerender();
    rerender();

    expect(persistence.get).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["the tile is offscreen", { visible: false }],
    ["the poster is not cached", { cachedPoster: null }],
    ["a preview session is already demanded", { previewSessionDemand: true }],
    ["the source is unknown", { source: null }],
  ])("stays off disk while %s", async (_case, overrides) => {
    renderHook(() => useHydratedSourceFacts({ ...cachedTile(), ...overrides }));

    await Promise.resolve();
    expect(persistence.get).not.toHaveBeenCalled();
  });

  it("stays off disk when the range is already published", async () => {
    publishSourceBootstrap(SOURCE, { timeRange: PERSISTED_RANGE });

    renderHook(() => useHydratedSourceFacts(cachedTile()));

    await Promise.resolve();
    expect(persistence.get).not.toHaveBeenCalled();
  });
});

function cachedTile() {
  return {
    cachedPoster: poster(),
    previewSessionDemand: false,
    source: SOURCE,
    sourceFactsScope: SCOPE,
    visible: true,
  };
}

function poster(): GridPosterCacheEntry {
  return {
    bytes: new Uint8Array([1, 2, 3]),
    height: 180,
    mimeType: "image/webp",
    sourceKind: "image",
    streamId: "/camera/front",
    streamSourceName: "/camera/front",
    streamSourceNames: ["/camera/front"],
    width: 320,
  };
}

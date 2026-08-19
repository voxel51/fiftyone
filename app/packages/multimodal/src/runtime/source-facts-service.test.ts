import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ByteSourceDescriptor,
  EpisodeManifest,
  EpisodeTimeline,
} from "../ir";
import type { EpisodeSession } from "../ports";
import {
  getSourceSessionHints,
  peekSourceBootstrap,
  resetSourceBootstrapCacheForTests,
} from "./source-bootstrap-cache";
import {
  SOURCE_FACTS_SCHEMA_VERSION,
  sourceFactsIdentity,
  type SourceFactsScope,
  type StoredSourceFactsV1,
} from "./source-facts";
import {
  resetSourceFactsPersistenceForTests,
  type SourceFactsPersistence,
} from "./source-facts-persistence";

const byteClientHarness = vi.hoisted(() => ({ stat: vi.fn() }));

vi.mock("../query/bytes", async (importOriginal) => {
  const original = await importOriginal<typeof import("../query/bytes")>();
  return {
    ...original,
    createDefaultByteClient: () => ({
      readBytes: vi.fn(),
      stat: byteClientHarness.stat,
    }),
  };
});

import {
  getSourceFactsDiagnostics,
  recordPreviewSourceFacts,
  recordSessionSourceFacts,
  resetSourceFactsServiceForTests,
  resolveSourceFactsHints,
} from "./source-facts-service";

const SCOPE: SourceFactsScope = {
  cachePartition: "partition",
  datasetId: "dataset",
  mediaField: "filepath",
};

describe("source facts service", () => {
  let persistence: SourceFactsPersistence;

  beforeEach(() => {
    byteClientHarness.stat.mockReset();
    resetSourceBootstrapCacheForTests();
    resetSourceFactsServiceForTests();
    persistence = {
      clear: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
      get: vi.fn(async () => null),
      put: vi.fn(async () => ({ byteLength: 100, stored: true })),
    };
    resetSourceFactsPersistenceForTests(persistence);
  });

  it("hydrates matching ETag facts as trusted adapter hints", async () => {
    const source = createSource({ etag: "abc", sizeBytes: "100" });
    vi.mocked(persistence.get).mockResolvedValue(entry(source));

    await expect(
      resolveSourceFactsHints(source, SCOPE, "mcap"),
    ).resolves.toEqual({
      adapterId: "mcap",
      manifestHint: manifest(),
      playbackHint: timeline(),
    });
  });

  it("hydrates a matching local-file signature without transport work", async () => {
    const file = new File([new Uint8Array(10)], "run.mcap", {
      lastModified: 42,
    });
    const source = createSource({
      localFile: file,
      sourceId: "local-run",
      url: "local-file:run.mcap:10:42",
    });
    vi.mocked(persistence.get).mockResolvedValue({
      ...entry(source),
      validator: {
        kind: "local-file",
        lastModified: 42,
        name: "run.mcap",
        sizeBytes: "10",
      },
    });

    await expect(
      resolveSourceFactsHints(source, SCOPE, "mcap"),
    ).resolves.toEqual({
      adapterId: "mcap",
      manifestHint: manifest(),
      playbackHint: timeline(),
    });
    expect(byteClientHarness.stat).not.toHaveBeenCalled();
  });

  it("hydrates unknown remote validators for UI only", async () => {
    const source = createSource();
    vi.mocked(persistence.get).mockResolvedValue(entry(source));
    byteClientHarness.stat.mockResolvedValue(undefined);

    await expect(
      resolveSourceFactsHints(source, SCOPE, "mcap"),
    ).resolves.toBeNull();

    expect(peekSourceBootstrap(source)?.manifest).toEqual(manifest());
    expect(getSourceSessionHints(source, "mcap")).toBeNull();
  });

  it("continues cold when IndexedDB exceeds the local lookup deadline", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(persistence.get).mockReturnValue(new Promise(() => undefined));
      const pending = resolveSourceFactsHints(createSource(), SCOPE, "mcap");

      await vi.advanceTimersByTimeAsync(50);

      await expect(pending).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("deletes stale validators and wrong-adapter entries", async () => {
    const source = createSource({ etag: "new", sizeBytes: "100" });
    vi.mocked(persistence.get).mockResolvedValue(entry(source, "old"));

    await expect(
      resolveSourceFactsHints(source, SCOPE, "mcap"),
    ).resolves.toBeNull();
    expect(persistence.delete).toHaveBeenCalledTimes(1);

    vi.mocked(persistence.get).mockResolvedValue({
      ...entry(source, "new"),
      adapterId: "fixture",
    });
    await expect(
      resolveSourceFactsHints(source, SCOPE, "mcap"),
    ).resolves.toBeNull();
    expect(persistence.delete).toHaveBeenCalledTimes(2);
  });

  it("does not upgrade provisional facts after navigation aborts validation", async () => {
    const source = createSource();
    vi.mocked(persistence.get).mockResolvedValue(entry(source));
    let finishStat!: (value: ByteSourceDescriptor) => void;
    byteClientHarness.stat.mockImplementation(
      () =>
        new Promise<ByteSourceDescriptor>((resolve) => {
          finishStat = resolve;
        }),
    );
    const controller = new AbortController();

    await resolveSourceFactsHints(source, SCOPE, "mcap", {
      signal: controller.signal,
    });
    controller.abort();
    finishStat({ ...source, etag: "abc", sizeBytes: "100" });
    await Promise.resolve();
    await Promise.resolve();

    expect(getSourceSessionHints(source, "mcap")).toBeNull();
  });

  it("retracts provisional UI facts when background validation proves them stale", async () => {
    const source = createSource();
    vi.mocked(persistence.get).mockResolvedValue(entry(source));
    byteClientHarness.stat.mockResolvedValue({
      ...source,
      etag: "different",
      sizeBytes: "100",
    });

    await resolveSourceFactsHints(source, SCOPE, "mcap");
    await vi.waitFor(() =>
      expect(persistence.delete).toHaveBeenCalledWith(expect.any(String), 1),
    );

    expect(peekSourceBootstrap(source)).toBeNull();
  });

  it("persists preview and direct-session facts off their ready paths", async () => {
    const source = createSource({ etag: "abc", sizeBytes: "100" });
    recordPreviewSourceFacts(source, SCOPE, {
      bootstrapManifest: manifest(),
      bootstrapTimeline: timeline(),
      frame: null,
      status: "ready",
      streamId: null,
      streamSourceName: null,
      streamSourceNames: [],
    });
    await vi.waitFor(() => expect(persistence.put).toHaveBeenCalledTimes(1));

    recordSessionSourceFacts(source, SCOPE, {
      dispose: vi.fn(),
      manifest: manifest(),
      playback: { timeline: timeline() },
      read: vi.fn(),
    } as unknown as EpisodeSession);
    await vi.waitFor(() => expect(persistence.put).toHaveBeenCalledTimes(2));

    expect(persistence.put).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        adapterId: "mcap",
        facts: expect.objectContaining({
          manifest: manifest(),
          timeline: timeline(),
        }),
        validator: { etag: "abc", kind: "etag", sizeBytes: "100" },
      }),
    );
  });

  it("never issues remote validator probes from grid preview writes", async () => {
    const source = createSource();
    recordPreviewSourceFacts(source, SCOPE, {
      bootstrapManifest: manifest(),
      bootstrapTimeline: timeline(),
      frame: null,
      status: "ready",
      streamId: null,
      streamSourceName: null,
      streamSourceNames: [],
    });

    await vi.waitFor(() => expect(persistence.put).toHaveBeenCalledTimes(1));

    expect(byteClientHarness.stat).not.toHaveBeenCalled();
    expect(persistence.put).toHaveBeenCalledWith(
      expect.any(String),
      expect.not.objectContaining({ validator: expect.anything() }),
    );
  });

  it("allows demanded session writes to acquire a remote validator", async () => {
    const source = createSource();
    byteClientHarness.stat.mockResolvedValue({
      ...source,
      etag: "abc",
      sizeBytes: "100",
    });

    recordSessionSourceFacts(source, SCOPE, {
      dispose: vi.fn(),
      manifest: manifest(),
      playback: { timeline: timeline() },
      read: vi.fn(),
    } as unknown as EpisodeSession);

    await vi.waitFor(() => expect(persistence.put).toHaveBeenCalledTimes(1));

    expect(byteClientHarness.stat).toHaveBeenCalledWith(source);
    expect(persistence.put).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        validator: { etag: "abc", kind: "etag", sizeBytes: "100" },
      }),
    );
  });

  it("coalesces identical same-key write bursts", async () => {
    let finishWrite!: () => void;
    vi.mocked(persistence.put).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishWrite = () => resolve({ byteLength: 100, stored: true });
        }),
    );
    const source = createSource({ etag: "abc" });
    const result = {
      bootstrapManifest: manifest(),
      bootstrapTimeline: timeline(),
      frame: null,
      status: "ready" as const,
      streamId: null,
      streamSourceName: null,
      streamSourceNames: [],
    };

    recordPreviewSourceFacts(source, SCOPE, result);
    recordPreviewSourceFacts(source, SCOPE, result);
    await vi.waitFor(() => expect(persistence.put).toHaveBeenCalledTimes(1));
    finishWrite();
    await Promise.resolve();
    await Promise.resolve();

    expect(persistence.put).toHaveBeenCalledTimes(1);
  });

  it("records unavailable persistence as an invisible write failure", async () => {
    vi.mocked(persistence.put).mockResolvedValue({ stored: false });
    recordPreviewSourceFacts(createSource({ etag: "abc" }), SCOPE, {
      bootstrapManifest: manifest(),
      bootstrapTimeline: timeline(),
      frame: null,
      status: "ready",
      streamId: null,
      streamSourceName: null,
      streamSourceNames: [],
    });

    await vi.waitFor(() =>
      expect(getSourceFactsDiagnostics().writesFailed).toBe(1),
    );

    expect(getSourceFactsDiagnostics()).toMatchObject({
      encodedBytesWritten: 0,
      writesCompleted: 0,
      writesStarted: 1,
    });
  });
});

function createSource(
  fields: Partial<ByteSourceDescriptor> = {},
): ByteSourceDescriptor {
  return {
    sourceId: "sample-a",
    url: "https://app.example/media?filepath=%2Fdata%2Frun.mcap",
    ...fields,
  };
}

function entry(
  source: ByteSourceDescriptor,
  etag = "abc",
): StoredSourceFactsV1 {
  return {
    adapterId: "mcap",
    createdAt: 1,
    facts: {
      manifest: manifest(),
      timeline: timeline(),
      timeRange: { endNs: 20n, startNs: 10n },
    },
    identity: sourceFactsIdentity(source),
    scope: SCOPE,
    validator: { etag, kind: "etag", sizeBytes: "100" },
    version: SOURCE_FACTS_SCHEMA_VERSION,
  };
}

function manifest(): EpisodeManifest {
  return {
    episodeId: "sample-a",
    recordingFacts: { format: "mcap" },
    streams: [],
    timeDomain: { id: "log", kind: "timestamp" },
    timeRange: { endNs: 20n, startNs: 10n },
  };
}

function timeline(): EpisodeTimeline {
  return { endNs: 20n, startNs: 10n, timeDomainId: "log" };
}

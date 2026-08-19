import { describe, expect, it } from "vitest";
import type {
  ByteSourceDescriptor,
  EpisodeManifest,
  EpisodeTimeline,
} from "../ir";
import {
  decodeStoredSourceFacts,
  encodeStoredSourceFacts,
} from "./source-facts-codec";
import {
  canonicalSourceFactsLocator,
  SOURCE_FACTS_SCHEMA_VERSION,
  sourceFactsIdentity,
  sourceFactsKey,
  validateSourceFactsContent,
  type SourceFactsScope,
  type StoredSourceFactsV1,
} from "./source-facts";

const SCOPE: SourceFactsScope = {
  cachePartition: "partition-a",
  datasetId: "dataset-a",
  mediaField: "filepath",
};

describe("source facts identity", () => {
  it("survives signed media URL rotation without retaining credentials", () => {
    const first = sourceFactsIdentity({
      sourceId: "sample-a",
      url: "https://app.example/media?filepath=%2Fdata%2Frun.mcap&token=secret-a",
    });
    const second = sourceFactsIdentity({
      sourceId: "sample-a",
      url: "https://app.example/media?token=secret-b&filepath=%2Fdata%2Frun.mcap",
    });

    expect(sourceFactsKey(SCOPE, first)).toBe(sourceFactsKey(SCOPE, second));
    expect(first.canonicalLocator).toBe("/data/run.mcap");
    expect(JSON.stringify(first)).not.toContain("secret");
  });

  it("keeps full paths and every security/dataset scope dimension distinct", () => {
    const identity = sourceFactsIdentity(source("/first/run.mcap"));
    expect(sourceFactsKey(SCOPE, identity)).not.toBe(
      sourceFactsKey(SCOPE, {
        ...identity,
        canonicalLocator: "/second/run.mcap",
      }),
    );
    for (const scope of [
      { ...SCOPE, cachePartition: "partition-b" },
      { ...SCOPE, datasetId: "dataset-b" },
      { ...SCOPE, mediaField: "alternate" },
    ]) {
      expect(sourceFactsKey(scope, identity)).not.toBe(
        sourceFactsKey(SCOPE, identity),
      );
    }
    expect(
      sourceFactsKey(SCOPE, { ...identity, sourceId: "sample-b" }),
    ).not.toBe(sourceFactsKey(SCOPE, identity));
  });

  it("removes URL userinfo, query, fragment, and normalizes separators", () => {
    const locator = canonicalSourceFactsLocator(
      "https://bearer:secret@example.com/a\\b/run.mcap?signature=private#fragment",
    );

    expect(locator).toBe("https://example.com/a/b/run.mcap");
    expect(locator).not.toMatch(/bearer|secret|signature|private|fragment/);
  });

  it("removes credentials from URL-shaped source ids at the facts boundary", () => {
    const identity = sourceFactsIdentity({
      sourceId:
        "remote-url:https://bearer:secret@example.com/run.mcap?signature=private#fragment",
      url: "https://example.com/run.mcap?signature=private",
    });

    expect(identity.sourceId).toBe("remote-url:https://example.com/run.mcap");
    expect(JSON.stringify(identity)).not.toMatch(
      /bearer|secret|signature|private|fragment/,
    );
  });
});

describe("source facts codec", () => {
  it("round-trips manifest, calibration, topology, and timeline bigints", () => {
    const entry = storedEntry();
    const encoded = encodeStoredSourceFacts(entry);

    expect(encoded).not.toBeNull();
    expect(encoded?.value).not.toContain("poster");
    expect(decodeStoredSourceFacts(encoded?.value)).toEqual(entry);
  });

  it("round-trips an empty stream inventory", () => {
    const entry = storedEntry({
      manifest: { ...manifest(), calibrations: undefined, streams: [] },
    });

    expect(
      decodeStoredSourceFacts(encodeStoredSourceFacts(entry)?.value),
    ).toEqual(entry);
  });

  it("rejects malformed versions, ranges, domains, duplicates, and empty facts", () => {
    const encoded = encodeStoredSourceFacts(storedEntry());
    if (!encoded) throw new Error("Expected a valid source-facts fixture");
    expect(
      decodeStoredSourceFacts(
        encoded.value.replace('"version":1', '"version":2'),
      ),
    ).toBeNull();
    expect(
      encodeStoredSourceFacts(
        storedEntry({ timeRange: { endNs: 1n, startNs: 2n } }),
      ),
    ).toBeNull();
    expect(
      encodeStoredSourceFacts(
        storedEntry({
          manifest: {
            ...manifest(),
            streams: [manifest().streams[0], manifest().streams[0]],
          },
        }),
      ),
    ).toBeNull();
    expect(
      encodeStoredSourceFacts(
        storedEntry({ timeline: { ...timeline(), timeDomainId: "publish" } }),
      ),
    ).toBeNull();
    expect(
      encodeStoredSourceFacts({
        ...storedEntry(),
        facts: {},
      }),
    ).toBeNull();
  });
});

describe("source facts validators", () => {
  it("validates matching ETags and rejects ETag or size changes", () => {
    const validator = { kind: "etag", etag: "abc", sizeBytes: "100" } as const;
    expect(
      validateSourceFactsContent(validator, {
        etag: 'W/"abc"',
        sizeBytes: "100",
        sourceId: "sample-a",
        url: "/run.mcap",
      }),
    ).toBe("validated");
    expect(
      validateSourceFactsContent(validator, {
        etag: "different",
        sizeBytes: "100",
        sourceId: "sample-a",
        url: "/run.mcap",
      }),
    ).toBe("stale");
    expect(
      validateSourceFactsContent(validator, {
        sizeBytes: "101",
        sourceId: "sample-a",
        url: "/run.mcap",
      }),
    ).toBe("stale");
  });

  it("requires the complete local-file signature", () => {
    const file = new File([new Uint8Array(10)], "run.mcap", {
      lastModified: 42,
    });
    const sourceWithFile: ByteSourceDescriptor = {
      localFile: file,
      sourceId: "local",
      url: "local-file:run.mcap",
    };
    expect(
      validateSourceFactsContent(
        {
          kind: "local-file",
          lastModified: 42,
          name: "run.mcap",
          sizeBytes: "10",
        },
        sourceWithFile,
      ),
    ).toBe("validated");
    expect(
      validateSourceFactsContent(
        {
          kind: "local-file",
          lastModified: 41,
          name: "run.mcap",
          sizeBytes: "10",
        },
        sourceWithFile,
      ),
    ).toBe("stale");
  });
});

function storedEntry(
  facts: Partial<StoredSourceFactsV1["facts"]> = {},
): StoredSourceFactsV1 {
  return {
    adapterId: "mcap",
    createdAt: 1_725_000_000_000,
    facts: {
      manifest: manifest(),
      timeline: timeline(),
      timeRange: { endNs: 20n, startNs: 10n },
      ...facts,
    },
    identity: {
      canonicalLocator: "/data/run.mcap",
      sourceId: "sample-a",
    },
    scope: SCOPE,
    validator: { etag: "abc", kind: "etag", sizeBytes: "100" },
    version: SOURCE_FACTS_SCHEMA_VERSION,
  };
}

function manifest(): EpisodeManifest {
  return {
    calibrations: [
      {
        calibration: {
          D: [0.1, 0.2],
          K: [1, 0, 2, 0, 1, 3, 0, 0, 1],
          P: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0],
          R: [1, 0, 0, 0, 1, 0, 0, 0, 1],
          height: 480,
          kind: "camera-calibration",
          roi: {
            doRectify: false,
            height: 480,
            width: 640,
            xOffset: 0,
            yOffset: 0,
          },
          timestampNs: 10n,
          width: 640,
        },
        streamId: "camera-info",
      },
    ],
    episodeId: "sample-a",
    metadata: { profile: "test" },
    recordingFacts: {
      applicationSupport: {
        inspectableStreamCount: 1,
        renderableStreamCount: 1,
        unavailableStreamCount: 0,
      },
      format: "mcap",
      mcap: {
        attachments: [
          { dataSizeBytes: "4", mediaType: "text/plain", name: "note" },
        ],
        compression: [
          {
            chunkCount: 1,
            codec: "zstd",
            compressedBytes: "50",
            uncompressedBytes: "100",
          },
        ],
        messageIndexStatus: "complete",
      },
      messageCount: "1",
      sizeBytes: "100",
    },
    streams: [
      {
        id: "camera",
        kind: "image",
        metadata: { "mcap.topic": "/camera" },
        payload: {
          encoding: "jpeg",
          schema: "sensor_msgs/CompressedImage",
          schemaEncoding: "ros2msg",
        },
        sourceName: "/camera",
        timeRange: { endNs: 20n, startNs: 10n },
      },
    ],
    timeDomain: { id: "log", kind: "timestamp", originNs: 10n },
    timeRange: { endNs: 20n, startNs: 10n },
    transformTopology: {
      edges: [
        {
          childFrameId: "camera",
          parentFrameId: "vehicle",
          sourceStreamId: "tf-static",
        },
      ],
    },
  };
}

function timeline(): EpisodeTimeline {
  return {
    byteTimeline: [
      {
        cumulativeCompressedBytes: 50,
        endTimeNs: 20n,
        startOffsetBytes: 0n,
      },
    ],
    endNs: 20n,
    startNs: 10n,
    timeDomainId: "log",
  };
}

function source(path: string): ByteSourceDescriptor {
  return {
    sourceId: "sample-a",
    url: `https://app.example/media?filepath=${encodeURIComponent(path)}`,
  };
}

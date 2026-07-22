import { describe, expect, it } from "vitest";
import type {
  ByteSourceDescriptor,
  EpisodeManifest,
  EpisodePosterFrame,
  TimeWindow,
} from "../ir";
import {
  getSourceBootstrap,
  peekSourceBootstrap,
  publishSourceBootstrap,
  resetSourceBootstrapCacheForTests,
} from "./source-bootstrap-cache";

describe("source bootstrap cache", () => {
  it("merges inventory and poster facts for the same source", () => {
    resetSourceBootstrapCacheForTests();
    const source = createSource("sample");
    const manifest = createManifest("/camera");
    const poster = createPoster([1, 2, 3]);
    const timeRange = createTimeRange();

    publishSourceBootstrap(source, { manifest, timeRange });
    publishSourceBootstrap(source, {
      poster,
      posterStreamId: "/camera",
    });

    expect(getSourceBootstrap(source)).toEqual({
      poster,
      posterStreamId: "/camera",
      manifest,
      timeRange,
    });
  });

  it("evicts old entries under the source-count bound", () => {
    resetSourceBootstrapCacheForTests();
    const first = createSource("source-0");
    publishSourceBootstrap(first, { manifest: createManifest("first") });

    for (let index = 1; index <= 32; index++) {
      publishSourceBootstrap(createSource(`source-${index}`), {
        manifest: createManifest(`topic-${index}`),
      });
    }

    expect(getSourceBootstrap(first)).toBeNull();
    expect(getSourceBootstrap(createSource("source-32"))?.manifest).toEqual(
      createManifest("topic-32"),
    );
  });

  it("clears a stale poster topic when replacing the poster without one", () => {
    resetSourceBootstrapCacheForTests();
    const source = createSource("poster-replacement");
    const firstPoster = createPoster([1]);
    const replacementPoster = createPoster([2]);

    publishSourceBootstrap(source, {
      poster: firstPoster,
      posterStreamId: "/camera/first",
    });
    publishSourceBootstrap(source, { poster: replacementPoster });

    expect(peekSourceBootstrap(source)).toEqual({
      poster: replacementPoster,
    });
  });

  it("does not reuse bootstrap facts after the source validator changes", () => {
    resetSourceBootstrapCacheForTests();
    const initial = createSource("rewritten", "etag-a");
    const replacement = createSource("rewritten", "etag-b");

    publishSourceBootstrap(initial, { manifest: createManifest("initial") });

    expect(
      peekSourceBootstrap(createSource("rewritten", "etag-a"))?.manifest,
    ).toEqual(createManifest("initial"));
    expect(peekSourceBootstrap(replacement)).toBeNull();
  });
});

function createTimeRange(): TimeWindow {
  return { endNs: 20_000_000_000n, startNs: 500_000_000n };
}

function createSource(sourceId: string, etag?: string): ByteSourceDescriptor {
  return { sourceId, url: `memory://${sourceId}.mcap`, etag };
}

function createManifest(streamId: string): EpisodeManifest {
  return {
    episodeId: "episode",
    streams: [
      {
        id: streamId,
        kind: "image",
        payload: { encoding: "jpeg" },
        sourceName: streamId,
        timeRange: createTimeRange(),
      },
    ],
    timeDomain: { id: "recording", kind: "timestamp" },
    timeRange: createTimeRange(),
  };
}

function createPoster(bytes: number[]): EpisodePosterFrame {
  return {
    image: {
      bytes: new Uint8Array(bytes),
      kind: "encoded-image",
      mimeType: "image/jpeg",
    },
    kind: "image",
  };
}

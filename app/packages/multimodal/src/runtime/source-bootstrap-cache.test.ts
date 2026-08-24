import { describe, expect, it } from "vitest";
import type {
  ByteSourceDescriptor,
  EpisodeManifest,
  EpisodePosterFrame,
  TimeWindow,
} from "../ir";
import { getEpisodeTimeRange } from "./episode-time-range-registry";
import {
  getSourceBootstrap,
  getSourceBootstrapSnapshot,
  peekSourceBootstrap,
  publishEpisodePreviewBootstrap,
  publishSourceBootstrap,
  resetSourceBootstrapCacheForTests,
  subscribeSourceBootstrap,
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

    for (let index = 1; index <= 64; index++) {
      publishSourceBootstrap(createSource(`source-${index}`), {
        manifest: createManifest(`topic-${index}`),
      });
    }

    expect(getSourceBootstrap(first)).toBeNull();
    expect(getSourceBootstrap(createSource("source-64"))?.manifest).toEqual(
      createManifest("topic-64"),
    );
  });

  it("notifies a subscriber whose entry another source's publish evicts", () => {
    resetSourceBootstrapCacheForTests();
    const first = createSource("source-0");
    publishSourceBootstrap(first, { manifest: createManifest("first") });

    let notified = 0;
    const unsubscribe = subscribeSourceBootstrap(first, () => {
      notified++;
    });

    for (let index = 1; index <= 64; index++) {
      publishSourceBootstrap(createSource(`source-${index}`), {
        manifest: createManifest(`topic-${index}`),
      });
    }

    // The eviction is a change to THIS source's snapshot: the subscriber
    // re-reads and sees the removal, instead of rendering stale facts
    expect(notified).toBeGreaterThan(0);
    expect(getSourceBootstrapSnapshot(first)).toBeNull();
    unsubscribe();
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

  it("publishes the timeline-derived range into the bootstrap cache", () => {
    resetSourceBootstrapCacheForTests();
    const source = createSource("timeline-range");
    const timeline = {
      endNs: 30n,
      startNs: 10n,
      timeDomainId: "recording",
    } as const;

    publishEpisodePreviewBootstrap(source, {
      bootstrapTimeline: timeline,
      frame: null,
      status: "ready",
      streamId: null,
      streamSourceName: null,
      streamSourceNames: [],
    });

    expect(peekSourceBootstrap(source)?.timeRange).toEqual({
      endNs: 30n,
      startNs: 10n,
    });
    expect(peekSourceBootstrap(source)?.timeline).toBe(timeline);
    expect(peekSourceBootstrap(source)?.previewReadComplete).toBe(true);
    expect(getEpisodeTimeRange(source.sourceId)).toEqual({
      endNs: 30n,
      startNs: 10n,
    });
  });

  it("retains a bounded marker for a completed posterless preview", () => {
    resetSourceBootstrapCacheForTests();
    const source = createSource("posterless");

    publishEpisodePreviewBootstrap(source, {
      frame: null,
      status: "empty",
      streamId: null,
      streamSourceName: null,
      streamSourceNames: [],
    });

    expect(peekSourceBootstrap(source)).toEqual({
      previewReadComplete: true,
    });
  });

  it("publishes the explicit preview range when no timeline is available", () => {
    resetSourceBootstrapCacheForTests();
    const source = createSource("explicit-preview-range");
    const timeRange = createTimeRange();

    publishEpisodePreviewBootstrap(source, {
      bootstrapTimeRange: timeRange,
      frame: null,
      status: "ready",
      streamId: null,
      streamSourceName: null,
      streamSourceNames: [],
    });

    expect(peekSourceBootstrap(source)).toEqual({
      previewReadComplete: true,
      timeRange,
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

import { afterEach, describe, expect, it } from "vitest";

import type {
  ByteSourceDescriptor,
  EpisodeManifest,
  EpisodeTimeline,
} from "../ir";
import {
  publishSourceBootstrap,
  resetSourceBootstrapCacheForTests,
} from "../runtime";
import { episodeSourceFromByteSource } from "./episode-source";

afterEach(resetSourceBootstrapCacheForTests);

describe("episodeSourceFromByteSource", () => {
  it("hands grid manifest and playback metadata to the modal session", async () => {
    const source: ByteSourceDescriptor = {
      sourceId: "recording",
      url: "memory://recording.mcap",
    };
    const manifest: EpisodeManifest = {
      episodeId: "recording",
      streams: [],
      timeDomain: { id: "log", kind: "timestamp" },
      timeRange: { endNs: 20n, startNs: 10n },
    };
    const timeline: EpisodeTimeline = {
      byteTimeline: [
        {
          cumulativeCompressedBytes: 128,
          endTimeNs: 20n,
          startOffsetBytes: 0n,
        },
      ],
      endNs: 20n,
      startNs: 10n,
      timeDomainId: "log",
    };
    publishSourceBootstrap(source, { manifest, timeline });

    const episode = episodeSourceFromByteSource(source);

    expect(episode.manifestHint).toBe(manifest);
    expect(episode.playbackHint).toBe(timeline);
    await expect(episode.assets.list()).resolves.toEqual([
      { id: "recording", role: "recording" },
    ]);
  });
});

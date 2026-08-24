import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  ByteSourceDescriptor,
  EpisodeManifest,
  EpisodeTimeline,
} from "../../ir";
import {
  publishSourceBootstrap,
  resetSourceBootstrapCacheForTests,
} from "../../runtime";
import {
  episodeSourceFromByteSource,
  episodeSourceFromMediaReference,
} from "./episode-source";

afterEach(() => {
  resetSourceBootstrapCacheForTests();
  vi.unstubAllGlobals();
});

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

describe("episodeSourceFromMediaReference", () => {
  it("lazily exposes manifest assets as range-readable byte sources", async () => {
    const request = vi.fn().mockResolvedValue({
      json: async () => ({
        assets: [
          {
            asset_id: "camera",
            media_type: "video/mp4",
            role: "video-stream",
            size_bytes: 1234,
            url: "/dataset/d/sample/s/multimodal/assets/camera",
          },
        ],
      }),
      ok: true,
      status: 200,
      statusText: "OK",
    });
    vi.stubGlobal("fetch", request);

    const source = episodeSourceFromMediaReference("d", "s", {
      kind: "lerobot-episode",
      key: "source:17",
      version: "2",
    });

    expect(source.episodeId).toBe("source:17");
    expect(request).not.toHaveBeenCalled();
    await expect(source.assets.list()).resolves.toEqual([
      { id: "camera", mediaType: "video/mp4", role: "video-stream" },
    ]);
    await expect(source.assets.resolve("camera")).resolves.toMatchObject({
      sizeBytes: "1234",
      sourceId: "camera",
      url: "/dataset/d/sample/s/multimodal/assets/camera",
    });
    expect(request).toHaveBeenCalledTimes(1);
  });
});

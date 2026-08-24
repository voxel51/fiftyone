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
  it("deduplicates concurrent manifest-backed asset requests", async () => {
    const response = {
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
    };
    let resolveRequest: (value: typeof response) => void = () => undefined;
    const request = vi.fn().mockImplementation(
      () =>
        new Promise<typeof response>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    vi.stubGlobal("fetch", request);

    const source = episodeSourceFromMediaReference("d", "s", {
      kind: "lerobot-episode",
      key: "source:17",
      version: "1",
    });

    expect(source.episodeId).toBe("source:17");
    expect(request).not.toHaveBeenCalled();
    const listed = source.assets.list();
    const resolved = source.assets.resolve("camera");
    expect(request).toHaveBeenCalledTimes(1);
    resolveRequest(response);

    await expect(listed).resolves.toEqual([
      { id: "camera", mediaType: "video/mp4", role: "video-stream" },
    ]);
    await expect(resolved).resolves.toMatchObject({
      sizeBytes: "1234",
      sourceId: "camera",
      url: "/dataset/d/sample/s/multimodal/assets/camera",
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("retries a manifest request after a failed in-flight fetch", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: "Unavailable",
      })
      .mockResolvedValueOnce({
        json: async () => ({ assets: [] }),
        ok: true,
        status: 200,
        statusText: "OK",
      });
    vi.stubGlobal("fetch", request);

    const source = episodeSourceFromMediaReference("d", "s", {
      kind: "lerobot-episode",
      key: "source:17",
      version: "1",
    });

    await expect(source.assets.list()).rejects.toThrow(
      "Unable to resolve episode assets",
    );
    await expect(source.assets.list()).resolves.toEqual([]);
    expect(request).toHaveBeenCalledTimes(2);
  });
});

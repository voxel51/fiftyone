import { afterEach, describe, expect, it, vi } from "vitest";
import { setFetchFunction } from "@fiftyone/utilities";

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
import { episodeDisplayName } from "./episode-label";

afterEach(() => {
  resetSourceBootstrapCacheForTests();
  setFetchFunction("");
  vi.unstubAllGlobals();
});

describe("episodeDisplayName", () => {
  it("formats thin LeRobot episode metadata without requiring a filepath", () => {
    expect(
      episodeDisplayName({
        _id: "sample",
        duration: 14.2,
        episode_index: 7,
        task: "sort objects",
      }),
    ).toBe("Episode 7 · sort objects · 14.2s");
    expect(episodeDisplayName({ _id: "sample" })).toBeNull();
  });
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
    setFetchFunction("http://fiftyone.test", {}, "/proxy");
    const response = {
      json: async () => ({
        assets: [
          {
            asset_id: "camera",
            media_type: "video/mp4",
            role: "video-stream",
            feature_name: "observation.images.camera",
            selector: {
              from_timestamp: 1.25,
              kind: "video-timestamp-interval",
              to_timestamp: 2.5,
            },
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
    });

    expect(source.episodeId).toBe("source:17");
    expect(request).not.toHaveBeenCalled();
    const listed = source.assets.list();
    const resolved = source.assets.resolve("camera");
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      "http://fiftyone.test/proxy/dataset/d/sample/s/multimodal/manifest",
      expect.any(Object),
    );
    resolveRequest(response);

    await expect(listed).resolves.toEqual([
      {
        featureName: "observation.images.camera",
        id: "camera",
        mediaType: "video/mp4",
        metadata: { sizeBytes: "1234" },
        role: "video-stream",
        selector: {
          fromTimestamp: 1.25,
          kind: "video-timestamp-interval",
          toTimestamp: 2.5,
        },
      },
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
        status: 400,
        statusText: "Bad Request",
        url: "/manifest",
        json: async () => ({}),
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
    });

    await expect(source.assets.list()).rejects.toThrow(
      "Unable to resolve episode assets",
    );
    await expect(source.assets.list()).resolves.toEqual([]);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("rejects unknown manifest selectors before exposing an asset", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({
          assets: [
            {
              asset_id: "unsafe",
              media_type: "application/octet-stream",
              role: "tabular-frame-data",
              selector: { kind: "filesystem-path" },
              size_bytes: 1,
              url: "/asset",
            },
          ],
        }),
        ok: true,
        status: 200,
        statusText: "OK",
      }),
    );
    const source = episodeSourceFromMediaReference("d", "s", {
      kind: "lerobot-episode",
      key: "source:17",
      version: "1",
    });

    await expect(source.assets.list()).rejects.toThrow(
      "unknown asset selector",
    );
  });

  it("rejects unknown manifest roles before exposing an asset", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({
          assets: [
            {
              asset_id: "unsafe",
              media_type: "application/octet-stream",
              role: "filesystem-root",
              selector: { kind: "whole-file" },
              size_bytes: 1,
              url: "/asset",
            },
          ],
        }),
        ok: true,
        status: 200,
        statusText: "OK",
      }),
    );
    const source = episodeSourceFromMediaReference("d", "s", {
      kind: "lerobot-episode",
      key: "source:17",
      version: "1",
    });

    await expect(source.assets.list()).rejects.toThrow("unknown asset role");
  });

  it("accepts the auxiliary metadata roles emitted by the server", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({
          assets: [
            {
              asset_id: "statistics",
              media_type: "application/json",
              role: "dataset-statistics",
              selector: { kind: "whole-file" },
              size_bytes: 10,
              url: "/statistics",
            },
            {
              asset_id: "tasks",
              media_type: "application/octet-stream",
              role: "tasks-metadata",
              selector: { kind: "whole-file" },
              size_bytes: 20,
              url: "/tasks",
            },
          ],
        }),
        ok: true,
        status: 200,
        statusText: "OK",
      }),
    );
    const source = episodeSourceFromMediaReference("d", "s", {
      kind: "lerobot-episode",
      key: "source:17",
      version: "1",
    });

    await expect(source.assets.list()).resolves.toEqual([
      {
        id: "statistics",
        mediaType: "application/json",
        metadata: { sizeBytes: "10" },
        role: "dataset-statistics",
        selector: { kind: "whole-file" },
      },
      {
        id: "tasks",
        mediaType: "application/octet-stream",
        metadata: { sizeBytes: "20" },
        role: "tasks-metadata",
        selector: { kind: "whole-file" },
      },
    ]);
  });

  it("isolates caller cancellation on a shared manifest request", async () => {
    const response = {
      json: async () => ({ assets: [] }),
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
    });
    const controller = new AbortController();

    const aborted = source.assets.list({ signal: controller.signal });
    const surviving = source.assets.list();
    controller.abort();
    resolveRequest(response);

    await expect(aborted).rejects.toMatchObject({ name: "AbortError" });
    await expect(surviving).resolves.toEqual([]);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("does not fetch for an already-aborted caller", async () => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    const source = episodeSourceFromMediaReference("d", "s", {
      kind: "lerobot-episode",
      key: "source:17",
    });
    const controller = new AbortController();
    controller.abort();

    await expect(
      source.assets.list({ signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(request).not.toHaveBeenCalled();
  });
});

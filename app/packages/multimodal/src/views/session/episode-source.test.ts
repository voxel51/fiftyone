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

const manifestHarness = vi.hoisted(() => ({
  nowMs: { value: 0 },
  requestEpisodeManifest: vi.fn(),
}));

// The manifest's own lifetime is what is under test, so the clock it is
// measured against is driven rather than waited on
vi.mock("../../utils/monotonic-time", () => ({
  monotonicNowMs: () => manifestHarness.nowMs.value,
}));

// The source's job is normalizing one manifest and sharing one request
// between callers; batching a page of them is the transport's, and has its
// own tests
vi.mock("../../runtime/episode-manifests", () => ({
  requestEpisodeManifest: manifestHarness.requestEpisodeManifest,
}));

afterEach(() => {
  manifestHarness.nowMs.value = 0;
  manifestHarness.requestEpisodeManifest.mockReset();
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
  const manifestAsset = (overrides: Record<string, unknown> = {}) => ({
    asset_id: "camera",
    content_id: "object-1",
    media_type: "video/mp4",
    role: "video-stream",
    selector: {
      from_timestamp: 1.25,
      kind: "video-timestamp-interval",
      to_timestamp: 2.5,
    },
    url: "https://store.test/videos/file-000.mp4?signature=1",
    ...overrides,
  });

  const source = () =>
    episodeSourceFromMediaReference("d", "s", {
      kind: "lerobot-episode",
      key: "source:17",
    });

  it("keeps reading one manifest while its URLs still grant access", async () => {
    manifestHarness.requestEpisodeManifest.mockResolvedValue({
      assets: [manifestAsset()],
      max_age_seconds: 60,
    });
    const episode = source();

    await episode.assets.resolve("camera");
    manifestHarness.nowMs.value = 59_000;
    await episode.assets.resolve("camera");

    expect(manifestHarness.requestEpisodeManifest).toHaveBeenCalledTimes(1);
  });

  it("resolves again once the manifest outlives the bound it was served with", async () => {
    // Its URLs are what the byte layer fetches with, and nothing down there
    // can renew one, so a session open past their life must ask again rather
    // than keep reading against a lapsed authorization.
    manifestHarness.requestEpisodeManifest.mockResolvedValue({
      assets: [manifestAsset()],
      max_age_seconds: 60,
    });
    const episode = source();

    await episode.assets.resolve("camera");
    manifestHarness.nowMs.value = 60_001;
    await episode.assets.resolve("camera");

    expect(manifestHarness.requestEpisodeManifest).toHaveBeenCalledTimes(2);
  });

  it("holds a manifest served without a bound no longer than the ceiling", async () => {
    manifestHarness.requestEpisodeManifest.mockResolvedValue({
      assets: [manifestAsset()],
    });
    const episode = source();

    await episode.assets.resolve("camera");
    manifestHarness.nowMs.value = 5 * 60 * 1000 + 1;
    await episode.assets.resolve("camera");

    expect(manifestHarness.requestEpisodeManifest).toHaveBeenCalledTimes(2);
  });

  it("asks the transport once however many callers want the manifest", async () => {
    let settle: (value: { assets: unknown[] }) => void = () => undefined;
    manifestHarness.requestEpisodeManifest.mockImplementation(
      () =>
        new Promise<{ assets: unknown[] }>((resolve) => {
          settle = resolve;
        }),
    );
    const episode = source();

    expect(episode.episodeId).toBe("source:17");
    expect(manifestHarness.requestEpisodeManifest).not.toHaveBeenCalled();
    const listed = episode.assets.list();
    const resolved = episode.assets.resolve("camera");
    expect(manifestHarness.requestEpisodeManifest).toHaveBeenCalledTimes(1);
    expect(manifestHarness.requestEpisodeManifest).toHaveBeenCalledWith(
      "d",
      "s",
    );
    settle({ assets: [manifestAsset({ size_bytes: 1234 })] });

    await expect(listed).resolves.toEqual([
      {
        featureName: undefined,
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
      contentId: "object-1",
      sizeBytes: "1234",
      sourceId: "camera",
      url: "https://store.test/videos/file-000.mp4?signature=1",
    });
    expect(manifestHarness.requestEpisodeManifest).toHaveBeenCalledTimes(1);
  });

  it("carries the content id so shared objects are read once", async () => {
    // Two episodes of one source share a video file. Identified per
    // episode, each would fetch those bytes again.
    manifestHarness.requestEpisodeManifest.mockResolvedValue({
      assets: [manifestAsset()],
    });

    await expect(source().assets.resolve("camera")).resolves.toMatchObject({
      contentId: "object-1",
      sourceId: "camera",
    });
  });

  it("resolves an asset whose size the manifest does not record", async () => {
    // A manifest derived from the stored reference carries no size; a
    // ranged reader learns it from the response it was making anyway
    manifestHarness.requestEpisodeManifest.mockResolvedValue({
      assets: [manifestAsset()],
    });
    const episode = source();

    await expect(episode.assets.list()).resolves.toMatchObject([
      { metadata: {} },
    ]);
    const descriptor = await episode.assets.resolve("camera");
    expect(descriptor).not.toHaveProperty("sizeBytes");
  });

  it("retries after a failed manifest request", async () => {
    manifestHarness.requestEpisodeManifest
      .mockRejectedValueOnce(new Error("transport failed"))
      .mockResolvedValueOnce({ assets: [] });
    const episode = source();

    await expect(episode.assets.list()).rejects.toThrow(
      "Unable to resolve episode assets",
    );
    await expect(episode.assets.list()).resolves.toEqual([]);
    expect(manifestHarness.requestEpisodeManifest).toHaveBeenCalledTimes(2);
  });

  it("refuses assets it cannot describe safely", async () => {
    const cases = [
      {
        expected: "unknown asset selector",
        overrides: {
          role: "tabular-frame-data",
          selector: { kind: "filesystem-path" },
        },
        label: "an unknown selector",
      },
      {
        expected: "unknown asset role",
        overrides: {
          role: "filesystem-root",
          selector: { kind: "whole-file" },
        },
        label: "an unknown role",
      },
    ];
    for (const { expected, label, overrides } of cases) {
      manifestHarness.requestEpisodeManifest.mockResolvedValue({
        assets: [manifestAsset({ ...overrides, size_bytes: 1 })],
      });

      await expect(source().assets.list(), label).rejects.toThrow(expected);
    }
  });

  it("accepts the auxiliary metadata roles emitted by the server", async () => {
    manifestHarness.requestEpisodeManifest.mockResolvedValue({
      assets: [
        manifestAsset({
          asset_id: "statistics",
          media_type: "application/json",
          role: "dataset-statistics",
          selector: { kind: "whole-file" },
          size_bytes: 10,
        }),
        manifestAsset({
          asset_id: "tasks",
          media_type: "application/octet-stream",
          role: "tasks-metadata",
          selector: { kind: "whole-file" },
          size_bytes: 20,
        }),
      ],
    });

    await expect(source().assets.list()).resolves.toEqual([
      {
        featureName: undefined,
        id: "statistics",
        mediaType: "application/json",
        metadata: { sizeBytes: "10" },
        role: "dataset-statistics",
        selector: { kind: "whole-file" },
      },
      {
        featureName: undefined,
        id: "tasks",
        mediaType: "application/octet-stream",
        metadata: { sizeBytes: "20" },
        role: "tasks-metadata",
        selector: { kind: "whole-file" },
      },
    ]);
  });

  it("isolates caller cancellation on a shared manifest request", async () => {
    let settle: (value: { assets: unknown[] }) => void = () => undefined;
    manifestHarness.requestEpisodeManifest.mockImplementation(
      () =>
        new Promise<{ assets: unknown[] }>((resolve) => {
          settle = resolve;
        }),
    );
    const episode = source();
    const controller = new AbortController();

    const aborted = episode.assets.list({ signal: controller.signal });
    const surviving = episode.assets.list();
    controller.abort();
    settle({ assets: [] });

    await expect(aborted).rejects.toMatchObject({ name: "AbortError" });
    await expect(surviving).resolves.toEqual([]);
    expect(manifestHarness.requestEpisodeManifest).toHaveBeenCalledTimes(1);
  });

  it("does not ask for an already-aborted caller", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      source().assets.list({ signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(manifestHarness.requestEpisodeManifest).not.toHaveBeenCalled();
  });
});

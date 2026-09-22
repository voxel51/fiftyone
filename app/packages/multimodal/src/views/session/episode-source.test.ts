import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  setFetchFunction,
  type MediaAssetDescriptor,
} from "@fiftyone/utilities";

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
  episodeManifestSourceFromContext,
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
  beforeEach(() => {
    setFetchFunction("http://fiftyone.test", {}, "/proxy");
  });

  const reference = {
    _cls: "LeRobotEpisodeReference",
    data: [0, 0, 14, 16],
    key: "src/7",
    tasks: ["sort objects"],
    videos: { "observation.images.camera": [0, 0, 1.25, 2.5] },
  };

  const CAMERA_ASSET =
    "src/videos/observation.images.camera/chunk-000/file-000.mp4";

  const CAMERA = {
    featureName: "observation.images.camera",
    id: CAMERA_ASSET,
    mediaType: "video/mp4",
    role: "video-stream",
    selector: {
      fromTimestamp: 1.25,
      kind: "video-timestamp-interval",
      toTimestamp: 2.5,
    },
    src: "https://media.example/camera.mp4",
  };
  const INFO = {
    id: "src/meta/info.json",
    mediaType: "application/json",
    role: "dataset-info",
    selector: { kind: "whole-file" },
    src: "/data/src/meta/info.json",
  };

  function sourceFor(
    assets: readonly MediaAssetDescriptor[] = [CAMERA, INFO],
    sample: Record<string, unknown> = {},
  ) {
    return episodeSourceFromMediaReference(reference, {
      media: { assets, poster: CAMERA_ASSET },
      tasks: ["sort objects"],
      ...sample,
    });
  }

  it("exposes the assets the page delivered with the sample", async () => {
    const source = sourceFor();

    expect(source.episodeId).toBe("src/7");
    expect(source.reference).toBe(reference);
    await expect(source.assets.list()).resolves.toEqual([CAMERA, INFO]);
  });

  it("lists only video streams for a preview open", async () => {
    await expect(sourceFor().assets.list({ preview: true })).resolves.toEqual([
      CAMERA,
    ]);
  });

  it("carries the sample's frame rate only when it has a usable one", () => {
    expect(sourceFor([CAMERA], { fps: 30 }).fps).toBe(30);
    expect(sourceFor([CAMERA], { fps: 0 })).not.toHaveProperty("fps");
  });

  it("asks the server for nothing, listing or resolving", async () => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    const source = sourceFor();

    await source.assets.list();
    await source.assets.list({ preview: true });
    await source.assets.resolve(INFO.id);
    await source.assets.resolve(CAMERA_ASSET);

    expect(request).not.toHaveBeenCalled();
  });

  it("reads an asset addressed by URL directly and a local one through the server", async () => {
    const source = sourceFor();

    await expect(source.assets.resolve(CAMERA_ASSET)).resolves.toEqual({
      readProfile: "remote",
      sourceId: CAMERA_ASSET,
      url: "https://media.example/camera.mp4",
    });
    await expect(source.assets.resolve(INFO.id)).resolves.toEqual({
      readProfile: "local",
      sourceId: INFO.id,
      url: "http://fiftyone.test/proxy/media?filepath=%2Fdata%2Fsrc%2Fmeta%2Finfo.json",
    });
  });

  it("does not offer an asset the page could not locate", async () => {
    const source = sourceFor([CAMERA, { ...INFO, src: undefined }]);

    await expect(source.assets.list()).resolves.toEqual([CAMERA]);
    await expect(source.assets.resolve(INFO.id)).rejects.toThrow(
      "Unknown episode asset",
    );
  });

  it("rejects an asset the sample does not carry", async () => {
    await expect(sourceFor().assets.resolve("src/nope.json")).rejects.toThrow(
      "Unknown episode asset",
    );
  });

  it("refuses a listing whose caller already gave up", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      sourceFor().assets.list({ signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("episodeManifestSourceFromContext", () => {
  beforeEach(() => {
    setFetchFunction("http://fiftyone.test", {}, "/proxy");
  });

  const reference = { _cls: "LeRobotEpisodeReference", key: "src/7" };
  const ASSET = "src/videos/observation.images.camera/chunk-000/file-000.mp4";

  // what a sample the server serves itself looks like: an asset names its
  // source and its path, and carries no location of its own
  const ctx = {
    media: { mediaReference: reference },
    sample: {
      sample: {
        _id: "s1",
        _media: {
          assets: [
            {
              featureName: "observation.images.camera",
              id: ASSET,
              mediaType: "video/mp4",
              role: "video-stream",
              selector: { kind: "whole-file" },
            },
          ],
          poster: ASSET,
        },
      },
    },
  } as unknown as Parameters<typeof episodeManifestSourceFromContext>[0];

  it("locates an unlocated asset from the dataset's source table", async () => {
    const source = episodeManifestSourceFromContext(ctx, {
      src: "/data/sources/one",
    });

    await expect(source?.assets.list()).resolves.toHaveLength(1);
    await expect(source?.assets.resolve(ASSET)).resolves.toMatchObject({
      readProfile: "local",
      sourceId: ASSET,
      url: "http://fiftyone.test/proxy/media?filepath=%2Fdata%2Fsources%2Fone%2Fvideos%2Fobservation.images.camera%2Fchunk-000%2Ffile-000.mp4",
    });
  });

  it("offers nothing when the table that would locate it is absent", async () => {
    // the modal fetches its own sample, so this is what it saw before the
    // dataset's source table reached it
    const source = episodeManifestSourceFromContext(ctx, null);

    await expect(source?.assets.list()).resolves.toEqual([]);
  });
});

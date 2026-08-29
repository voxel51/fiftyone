import { open, stat } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { ByteSourceDescriptor } from "../../ir";
import type {
  AssetDescriptor,
  ByteResources,
  EpisodeSession,
  EpisodeSource,
} from "../../ports";
import { isEpisodeReadCancelledError } from "../../ports";
import {
  collectBatches,
  defineEpisodeSessionContractTests,
} from "../../testing/adapter-contract";
import { detectLeRobotSample } from "./descriptor";
import { createLeRobotFormatAdapter } from "./format-adapter";

const info = {
  codebase_version: "v3.0",
  features: {
    action: {
      dtype: "float32",
      names: ["joint_a", "joint_b"],
      shape: [2],
    },
    "action.gripper": { dtype: "float32", shape: [1] },
    language_instruction: { dtype: "string", shape: [1] },
    task_progress: { dtype: "float32", shape: [1] },
    "observation.state": {
      dtype: "float32",
      names: ["joint_a", "joint_b"],
      shape: [2],
    },
    success: { dtype: "bool", shape: [1] },
    "observation.images.test": {
      dtype: "video",
      info: { "video.codec": "h264", "video.fps": 2 },
      shape: [16, 16, 3],
    },
    "observation.images.embedded": {
      dtype: "image",
      shape: [1, 1, 3],
    },
    timestamp: { dtype: "float32", shape: [1] },
  },
  fps: 30,
  robot_type: "test-arm",
};

const infoBytes = new TextEncoder().encode(JSON.stringify(info));
const tinyMp4Bytes = new Uint8Array(
  Buffer.from(
    [
      "AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAMwbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAA+gAAQAAAQAA",
      "AAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAA",
      "Alt0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAA+gAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAA",
      "AAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAPoAAAAAAABAAAAAAHTbWRpYQAAACBtZGhk",
      "AAAAAAAAAAAAAAAAAABAAAAAQABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABfm1p",
      "bmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAT5zdGJsAAAAvnN0c2QA",
      "AAAAAAAAAQAAAK5hdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABFUxhdmM2Mi4xMS4xMDAgbGli",
      "eDI2NAAAAAAAAAAAAAAAGP//AAAANGF2Y0MBZAAK/+EAF2dkAAqs2V7ARAAAAwAEAAADABA8SJZYAQAGaOvjyyLA/fj4AAAAABBw",
      "YXNwAAAAAQAAAAEAAAAUYnRydAAAAAAAABa4AAAAAAAAABhzdHRzAAAAAAAAAAEAAAACAAAgAAAAABRzdHNzAAAAAAAAAAEAAAAB",
      "AAAAHHN0c2MAAAAAAAAAAQAAAAEAAAACAAAAAQAAABxzdHN6AAAAAAAAAAAAAAACAAACywAAAAwAAAAUc3RjbwAAAAAAAAABAAAD",
      "YAAAAGF1ZHRhAAAAWW1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAALGlsc3QAAAAkqXRvbwAAABxk",
      "YXRhAAAAAQAAAABMYXZmNjIuMy4xMDAAAAAIZnJlZQAAAt9tZGF0AAACrQYF//+p3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3Jl",
      "IDE2NSByMzIyMiBiMzU2MDVhIC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAyNSAtIGh0dHA6Ly93",
      "d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTEgcmVmPTMgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4",
      "MzoweDExMyBtZT1oZXggc3VibWU9NyBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTE2IGNocm9t",
      "YV9tZT0xIHRyZWxsaXM9MSA4eDhkY3Q9MSBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNl",
      "dD0tMiB0aHJlYWRzPTEgbG9va2FoZWFkX3RocmVhZHM9MSBzbGljZWRfdGhyZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxh",
      "Y2VkPTAgYmx1cmF5X2NvbXBhdD0wIGNvbnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz0zIGJfcHlyYW1pZD0yIGJfYWRhcHQ9MSBi",
      "X2JpYXM9MCBkaXJlY3Q9MSB3ZWlnaHRiPTEgb3Blbl9nb3A9MCB3ZWlnaHRwPTIga2V5aW50PTI1MCBrZXlpbnRfbWluPTIgc2Nl",
      "bmVjdXQ9NDAgaW50cmFfcmVmcmVzaD0wIHJjX2xvb2thaGVhZD00MCByYz1jcmYgbWJ0cmVlPTEgY3JmPTIzLjAgcWNvbXA9MC42",
      "MCBxcG1pbj0wIHFwbWF4PTY5IHFwc3RlcD00IGlwX3JhdGlvPTEuNDAgYXE9MToxLjAwAIAAAAAWZYiEABT//uzafgU2PdfnxTQ3",
      "tZS2gQAAAAhBmiFsQS/+4A==",
    ].join(""),
    "base64",
  ),
);
const tinyAv1Mp4Bytes = new Uint8Array(
  Buffer.from(
    [
      "AAAAIGZ0eXBpc29tAAACAGlzb21hdjAxaXNvMm1wNDEAAAMebW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAA+gAAQAA",
      "AQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      "AgAAAkl0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAA+gAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAB",
      "AAAAAAAAAAAAAAAAAABAAAAAAEAAAABAAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAPoAAAAAAABAAAAAAHBbWRpYQAAACB",
      "tZGhkAAAAAAAAAAAAAAAAAABAAAAAQABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAAB",
      "bG1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAASxzdGJsAAAArHN0c",
      "2QAAAAAAAAAAQAAAJxhdjAxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAEAAQABIAAAASAAAAAAAAAABF0xhdmM2Mi4xMS4xMDAg",
      "bGlic3Z0YXYxAAAAAAAAAAAAGP//AAAAGGF2MUOBAAwACgoAAAACr/+AXwAIAAAACmZpZWwBAAAAABBwYXNwAAAAAQAAAAEAAAAU",
      "YnRydAAAAAAAAAGoAAABqAAAABhzdHRzAAAAAAAAAAEAAAACAAAgAAAAABRzdHNzAAAAAAAAAAEAAAABAAAAHHN0c2MAAAAAAAAA",
      "AQAAAAEAAAACAAAAAQAAABxzdHN6AAAAAAAAAAAAAAACAAAAIwAAABIAAAAUc3RjbwAAAAAAAAABAAADTgAAAGF1ZHRhAAAAWW1l",
      "dGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAALGlsc3QAAAAkqXRvbwAAABxkYXRhAAAAAQAAAABMYXZm",
      "NjIuMy4xMDAAAAAIZnJlZQAAAD1tZGF0CgoAAAACr/+JXyAIMhUQAMGCCyxRQgAACJQNlzHvMaZyCPgyEDACBAkkkiOQAAACAAA",
      "AnFA=",
    ].join(""),
    "base64",
  ),
);
const EPISODE_ROW_START = 100;
const EPISODE_ROW_END = 101;
const assets: readonly AssetDescriptor[] = [
  {
    id: "info",
    mediaType: "application/json",
    metadata: { sizeBytes: infoBytes.byteLength.toString() },
    role: "dataset-info",
    selector: { kind: "whole-file" },
  },
  {
    id: "episodes",
    mediaType: "application/vnd.apache.parquet",
    metadata: { sizeBytes: "1" },
    role: "episode-metadata",
    selector: {
      coordinateSystem: "parquet-file-row",
      end: EPISODE_ROW_END,
      kind: "row-interval",
      start: EPISODE_ROW_START,
    },
  },
  {
    id: "data",
    mediaType: "application/vnd.apache.parquet",
    metadata: { chunkIndex: "0", fileIndex: "0", sizeBytes: "2" },
    role: "tabular-frame-data",
    selector: {
      coordinateSystem: "parquet-file-row",
      end: 3,
      kind: "row-interval",
      start: 0,
    },
  },
  {
    featureName: "observation.images.embedded",
    id: "images",
    mediaType: "application/vnd.apache.parquet",
    metadata: { sizeBytes: "2" },
    role: "image-payload",
    selector: {
      coordinateSystem: "parquet-file-row",
      end: 3,
      kind: "row-interval",
      start: 0,
    },
  },
  {
    featureName: "observation.images.test",
    id: "video",
    mediaType: "video/mp4",
    metadata: {
      chunkIndex: "0",
      fileIndex: "0",
      sizeBytes: tinyMp4Bytes.byteLength.toString(),
      stream: "observation.images.test",
    },
    role: "video-stream",
    selector: {
      fromTimestamp: 0,
      kind: "video-timestamp-interval",
      toTimestamp: 1,
    },
  },
];

const episodeRow = {
  "data/chunk_index": 0n,
  "data/file_index": 0n,
  dataset_from_index: 0n,
  dataset_to_index: 3n,
  episode_index: 0n,
  length: 3n,
  "stats/timestamp/max": [0.06666667],
  "stats/timestamp/min": [0],
  "videos/observation.images.test/chunk_index": 0n,
  "videos/observation.images.test/file_index": 0n,
  "videos/observation.images.test/from_timestamp": 0,
  "videos/observation.images.test/to_timestamp": 1,
};

const dataRows = [
  {
    action: [1, 2],
    "action.gripper": [0.1],
    episode_index: 0n,
    frame_index: 0n,
    index: 0n,
    language_instruction: "reach for the cube",
    "observation.images.embedded": Uint8Array.of(0xff, 0xd8, 0xff, 0xd9),
    "observation.state": [3, 4],
    task_index: 0n,
    task_progress: [0.1],
    timestamp: 0,
    success: false,
  },
  {
    action: [5, 6],
    "action.gripper": [0.2],
    episode_index: 0n,
    frame_index: 1n,
    index: 1n,
    language_instruction: "reach for the cube",
    "observation.images.embedded": Uint8Array.of(0xff, 0xd8, 0xff, 0xd9),
    "observation.state": [7, 8],
    task_index: 0n,
    task_progress: [0.5],
    timestamp: 0.033333335,
    success: true,
  },
  {
    action: [9, 10],
    "action.gripper": [0.3],
    episode_index: 0n,
    frame_index: 2n,
    index: 2n,
    language_instruction: "reach for the cube",
    "observation.images.embedded": Uint8Array.of(0xff, 0xd8, 0xff, 0xd9),
    "observation.state": [11, 12],
    task_index: 0n,
    task_progress: [1],
    timestamp: 0.06666667,
    success: true,
  },
];

const source: EpisodeSource = {
  assets: {
    list: async () => assets,
    resolve: async (assetId) => descriptor(assetId),
  },
  episodeId: "episode-0",
};

const io: ByteResources = {
  readBytes: async ({ range, source: byteSource }) => {
    const start = Number(range.offset);
    const end = start + Number(range.length);
    const bytes =
      byteSource.sourceId === "info"
        ? infoBytes.slice(start, end)
        : byteSource.sourceId === "video"
          ? tinyMp4Bytes.slice(start, end)
          : new Uint8Array(Number(range.length));
    return { bytes, range, source: byteSource };
  },
};

function descriptor(assetId: string): ByteSourceDescriptor {
  const asset = assets.find((candidate) => candidate.id === assetId);
  if (!asset) throw new Error(`Unknown test asset ${assetId}`);
  return {
    sizeBytes: asset.metadata?.sizeBytes,
    sourceId: asset.id,
    url: `memory://${asset.id}`,
  };
}

const readParquetObjects = vi.fn(
  async (options: {
    columns?: string[];
    file: { byteLength: number };
    rowEnd?: number;
    rowStart?: number;
  }) => {
    if (
      !options.columns &&
      options.rowStart === EPISODE_ROW_START &&
      options.rowEnd === EPISODE_ROW_END
    ) {
      return [episodeRow];
    }
    return dataRows.slice(
      options.rowStart ?? 0,
      options.rowEnd ?? dataRows.length,
    );
  },
);

defineEpisodeSessionContractTests({
  createSession: () =>
    createLeRobotFormatAdapter({ readParquetObjects }).open(source, io),
  name: "lerobot",
});

describe("LeRobot format adapter", () => {
  it("detects only explicit LeRobot source identities", () => {
    expect(
      detectLeRobotSample({
        mediaType: "multimodal",
        mediaReference: {
          kind: "lerobot-episode",
          key: "source:17",
        },
      }),
    ).toBe(true);
    expect(
      detectLeRobotSample({
        mediaType: "application/x-lerobot",
        mediaReference: {
          kind: "lerobot-episode",
          key: "source:17",
        },
      }),
    ).toBe(false);
    expect(
      detectLeRobotSample({
        mediaType: "multimodal",
        path: "/robot/run/meta/info.json",
      }),
    ).toBe(false);
  });

  it("publishes canonical catalog and recording facts even with a stale hint", async () => {
    const staleSource: EpisodeSource = {
      ...source,
      manifestHint: {
        episodeId: "stale",
        streams: [],
        timeDomain: { id: "stale", kind: "duration" },
        timeRange: { endNs: 0n, startNs: 0n },
      },
    };
    const session = await createLeRobotFormatAdapter({
      readParquetObjects,
    }).open(staleSource, io);
    try {
      const byName = new Map(
        session.manifest.streams.map((stream) => [stream.sourceName, stream]),
      );
      expect(byName.get("observation.state")?.metadata).toMatchObject({
        "stream.category": "observations",
        "stream.count_noun": "samples",
        "stream.inspectable": "true",
      });
      expect(byName.get("action")?.metadata).toMatchObject({
        "stream.category": "actions",
        "stream.inspectable": "true",
      });
      expect(byName.get("action.gripper")?.metadata).toMatchObject({
        "stream.category": "actions",
        "stream.inspectable": "true",
      });
      expect(byName.get("language_instruction")?.metadata).toMatchObject({
        "stream.category": "instructions",
        "stream.inspectable": "false",
      });
      expect(byName.get("success")?.metadata).toMatchObject({
        "stream.category": "custom",
        "stream.inspectable": "true",
      });
      expect(byName.get("task_progress")?.metadata).toMatchObject({
        "stream.category": "custom",
        "stream.inspectable": "true",
      });
      expect(byName.get("observation.images.embedded")).toMatchObject({
        count: 3,
        kind: "image",
        metadata: {
          "stream.category": "observations",
          "stream.count_noun": "frames",
          "stream.inspectable": "false",
        },
      });
      expect(byName.get("observation.images.test")).toMatchObject({
        kind: "video",
        metadata: { "stream.inspectable": "false" },
      });
      expect(byName.get("observation.images.test")).not.toHaveProperty("count");
      expect(session.manifest.recordingFacts).toMatchObject({
        applicationSupport: {
          inspectableStreamCount: 5,
          renderableStreamCount: 2,
          unavailableStreamCount: 1,
        },
        durationNs: "1000000000",
        format: "lerobot",
        lerobot: {
          codebaseVersion: "v3.0",
          episodeIndex: "0",
          featureCount: 9,
          fps: 30,
          logicalRowCount: 3,
          mediaFeatureCount: 2,
          robotType: "test-arm",
          videoCodecs: ["h264"],
        },
      });
      expect(session.manifest.recordingFacts).not.toHaveProperty(
        "messageCount",
      );
    } finally {
      session.dispose();
    }
  });

  it("exposes named vector values through the numeric capability", async () => {
    readParquetObjects.mockClear();
    const session = await createLeRobotFormatAdapter({
      readParquetObjects,
    }).open(source, io);
    try {
      expect(
        await session.numericSeries?.enumerateNumericFields(["lerobot:action"]),
      ).toEqual([
        {
          availability: "ready",
          encoding: "float32",
          fields: [
            { path: "action.joint_a", valueType: "float32" },
            { path: "action.joint_b", valueType: "float32" },
          ],
          sourceName: "action",
          streamId: "lerobot:action",
        },
      ]);
      expect(
        await session.numericSeries?.readNumericSeries({
          fields: ["action.joint_b"],
          stream: "lerobot:action",
          window: session.manifest.timeRange,
        }),
      ).toEqual({
        baseTimeNs: 0n,
        fields: [
          {
            path: "action.joint_b",
            timesSec: Float64Array.from([0, 0.033333335, 0.06666667]),
            values: Float64Array.from([2, 6, 10]),
          },
        ],
        sampleCount: 3,
        streamId: "lerobot:action",
        truncated: false,
      });
      await session.numericSeries?.readNumericSeries({
        fields: ["action.joint_a"],
        stream: "lerobot:action",
        window: session.manifest.timeRange,
      });
      expect(readParquetObjects).toHaveBeenCalledTimes(3);
    } finally {
      session.dispose();
    }
  });

  it("projects boolean scalar values as plottable zero/one samples", async () => {
    const session = await createLeRobotFormatAdapter({
      readParquetObjects,
    }).open(source, io);
    try {
      await expect(
        session.numericSeries?.readNumericSeries({
          fields: ["success"],
          stream: "lerobot:success",
          window: session.manifest.timeRange,
        }),
      ).resolves.toMatchObject({
        fields: [
          {
            path: "success",
            values: Float64Array.from([0, 1, 1]),
          },
        ],
      });
    } finally {
      session.dispose();
    }
  });

  it("cancels speculative reads without cancelling current reads", async () => {
    const session = await createLeRobotFormatAdapter({
      readParquetObjects,
    }).open(source, io);
    const current = collectBatches(
      session.read({
        priority: "current",
        streams: ["lerobot:action"],
        window: session.manifest.timeRange,
      }),
    );
    session.cancelIdle?.();
    await expect(current).resolves.toHaveLength(1);

    const idle = collectBatches(
      session.read({
        priority: "idle",
        streams: ["lerobot:action"],
        window: session.manifest.timeRange,
      }),
    );
    session.cancelIdle?.();
    await expect(idle).rejects.toSatisfy(isEpisodeReadCancelledError);
    session.dispose();
  });

  it("keeps concurrent episode sessions independently readable", async () => {
    const adapter = createLeRobotFormatAdapter({ readParquetObjects });
    const firstSession = await adapter.open(source, io);
    const secondSession = await adapter.open(source, io);
    try {
      const request = (session: EpisodeSession) =>
        collectBatches(
          session.read({
            streams: ["lerobot:action"],
            window: session.manifest.timeRange,
          }),
        );
      await expect(
        Promise.all([request(firstSession), request(secondSession)]),
      ).resolves.toEqual([expect.any(Array), expect.any(Array)]);
      firstSession.dispose();
      await expect(request(secondSession)).resolves.toHaveLength(1);
    } finally {
      firstSession.dispose();
      secondSession.dispose();
    }
  });

  it("demuxes an in-memory MP4 fixture into encoded video IR", async () => {
    const session = await createLeRobotFormatAdapter({
      readParquetObjects,
    }).open(source, io);
    try {
      const batches = await collectBatches(
        session.read({
          streams: ["lerobot:observation.images.test"],
          window: session.manifest.timeRange,
        }),
      );
      expect(batches).toHaveLength(1);
      expect(batches[0].frames[0].output.visualization).toMatchObject({
        codec: "h264",
        keyframe: true,
        kind: "encoded-video",
      });
      expect(
        batches[0].frames[0].output.resourceHints?.sizeBytes,
      ).toBeGreaterThan(0);
    } finally {
      session.dispose();
    }
  });

  it("reuses an MP4 GOP prefix and reads only its missing tail", async () => {
    const readBytes = vi.fn<ByteResources["readBytes"]>((request) =>
      io.readBytes(request),
    );
    const session = await createLeRobotFormatAdapter({
      readParquetObjects,
    }).open(source, { readBytes });
    const readVideo = (endNs: bigint) =>
      collectBatches(
        session.read({
          streams: ["lerobot:observation.images.test"],
          window: { endNs, startNs: 0n },
        }),
      );
    try {
      await readVideo(0n);
      const firstReads = readBytes.mock.calls
        .map(([request]) => request)
        .filter((request) => request.source.sourceId === "video");
      const firstSpan = firstReads.at(-1)?.range;
      if (!firstSpan) throw new Error("Expected an MP4 sample span read");

      await readVideo(500_000_000n);
      const extendedReads = readBytes.mock.calls
        .map(([request]) => request)
        .filter((request) => request.source.sourceId === "video");
      expect(extendedReads).toHaveLength(firstReads.length + 1);
      const tail = extendedReads.at(-1)?.range;
      expect(tail?.offset).toBe(firstSpan.offset + firstSpan.length);

      await readVideo(500_000_000n);
      expect(
        readBytes.mock.calls
          .map(([request]) => request)
          .filter((request) => request.source.sourceId === "video"),
      ).toHaveLength(extendedReads.length);
    } finally {
      session.dispose();
    }
  });

  it("reads synchronized camera batches concurrently", async () => {
    const secondFeature = "observation.images.second";
    const dualInfo = {
      ...info,
      features: {
        ...info.features,
        [secondFeature]: info.features["observation.images.test"],
      },
    };
    const dualInfoBytes = new TextEncoder().encode(JSON.stringify(dualInfo));
    const firstVideoAsset = assets.find((asset) => asset.id === "video");
    if (!firstVideoAsset) throw new Error("Missing test video asset");
    const dualAssets = [
      ...assets.map((asset) =>
        asset.id === "info"
          ? {
              ...asset,
              metadata: { sizeBytes: dualInfoBytes.byteLength.toString() },
            }
          : asset,
      ),
      {
        ...firstVideoAsset,
        featureName: secondFeature,
        id: "video-second",
        metadata: {
          ...firstVideoAsset.metadata,
          stream: secondFeature,
        },
      },
    ];
    let activeVideoReads = 0;
    let maxActiveVideoReads = 0;
    const dualSource: EpisodeSource = {
      assets: {
        list: async () => dualAssets,
        resolve: async (assetId) => {
          const asset = dualAssets.find(
            (candidate) => candidate.id === assetId,
          );
          if (!asset) throw new Error(`Unknown dual-camera asset ${assetId}`);
          return {
            sizeBytes: asset.metadata?.sizeBytes,
            sourceId: asset.id,
            url: `memory://${asset.id}`,
          };
        },
      },
      episodeId: "episode-0",
    };
    const dualIo: ByteResources = {
      readBytes: async (request) => {
        const isVideo = request.source.sourceId.startsWith("video");
        if (isVideo) {
          activeVideoReads += 1;
          maxActiveVideoReads = Math.max(maxActiveVideoReads, activeVideoReads);
          await Promise.resolve();
        }
        try {
          const start = Number(request.range.offset);
          const end = start + Number(request.range.length);
          const bytes =
            request.source.sourceId === "info"
              ? dualInfoBytes.slice(start, end)
              : isVideo
                ? tinyMp4Bytes.slice(start, end)
                : new Uint8Array(Number(request.range.length));
          return { bytes, range: request.range, source: request.source };
        } finally {
          if (isVideo) activeVideoReads -= 1;
        }
      },
    };
    const session = await createLeRobotFormatAdapter({
      readParquetObjects,
    }).open(dualSource, dualIo);
    try {
      const streams = [
        "lerobot:observation.images.test",
        `lerobot:${secondFeature}`,
      ];
      const windows = await session.playback?.readSynchronizedBatch({
        streams,
        timeNs: [0n, 500_000_000n],
      });

      expect(maxActiveVideoReads).toBeGreaterThanOrEqual(2);
      expect(windows).toHaveLength(2);
      expect(windows?.[0].framesByStream[streams[0]]).toHaveLength(1);
      expect(windows?.[0].framesByStream[streams[1]]).toHaveLength(1);
      expect(windows?.[1].framesByStream[streams[0]]).toHaveLength(1);
      expect(windows?.[1].framesByStream[streams[1]]).toHaveLength(1);
    } finally {
      session.dispose();
    }
  });

  it("reads embedded images and exact bounded raw feature records", async () => {
    const session = await createLeRobotFormatAdapter({
      readParquetObjects,
    }).open(source, io);
    try {
      const batches = await collectBatches(
        session.read({
          streams: ["lerobot:observation.images.embedded"],
          window: { endNs: 0n, startNs: 0n },
        }),
      );
      expect(batches[0].frames[0].output.visualization).toMatchObject({
        kind: "encoded-image",
        mimeType: "image/jpeg",
      });
      expect(readParquetObjects.mock.lastCall?.[0]).toMatchObject({
        rowEnd: 1,
        rowStart: 0,
      });

      await expect(session.rawRecords?.listRawRecordStreams()).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            sourceName: "Episode rows",
            streamId: "lerobot:rows",
          }),
          expect.objectContaining({
            schemaName: "float32[2]",
            sourceName: "action",
            streamId: "lerobot:action",
          }),
          expect.objectContaining({
            schemaName: "float32[2]",
            sourceName: "observation.state",
            streamId: "lerobot:observation.state",
          }),
        ]),
      );

      await expect(
        session.rawRecords?.readRawRecordAtCursor?.({
          cursor: "row:1",
          includeFullJson: true,
          stream: "lerobot:rows",
        }),
      ).resolves.toMatchObject({
        cursor: "row:1",
        fullJson: expect.stringContaining('"frame_index": "1"'),
        sequence: 1,
        status: "ok",
        timestampNs: 33_333_335n,
      });
      await expect(
        session.rawRecords?.readRawRecordAtCursor?.({
          cursor: "row:1",
          includeFullJson: true,
          stream: "lerobot:action",
        }),
      ).resolves.toMatchObject({
        cursor: "row:1",
        fullJson: expect.stringContaining('"action.joint_a": 5'),
        root: {
          entries: [
            ["action.joint_a", { value: "5", valueType: "number" }],
            ["action.joint_b", { value: "6", valueType: "number" }],
          ],
        },
        schemaName: "float32[2]",
        sequence: 1,
        sourceName: "action",
        status: "ok",
        streamId: "lerobot:action",
        timestampNs: 33_333_335n,
      });
      expect(readParquetObjects.mock.lastCall?.[0]).toMatchObject({
        columns: ["timestamp", "frame_index", "action"],
        rowEnd: 2,
        rowStart: 1,
      });
    } finally {
      session.dispose();
    }
  });

  it("previews one deterministic camera frame at a time", async () => {
    const preview = await createLeRobotFormatAdapter({
      readParquetObjects,
    }).openPreview?.(source, io);
    if (!preview) throw new Error("LeRobot preview session is unavailable");
    try {
      const first = await preview.read({
        decodeLookaheadNs: 250_000_000n,
        sourceName: "observation.images.test",
      });
      expect(first).toMatchObject({
        frameTimeNs: 0n,
        nativeVideo: {
          codec: "h264",
          codecString: expect.stringMatching(/^avc1\./),
          endTimeSeconds: 1,
          source: {
            sourceId: "video",
            url: "memory://video",
          },
          startTimeSeconds: 0,
        },
        nextStartTimeNs: 500_000_000n,
        status: "ready",
        streamSourceName: "observation.images.test",
        streamSourceNames: [
          "observation.images.embedded",
          "observation.images.test",
        ],
      });
      expect(
        first.videoDecodeRunway?.map((frame) =>
          frame.kind === "image" && frame.image.kind === "encoded-video"
            ? frame.image.timestampNs
            : null,
        ),
      ).toEqual([0n, 500_000_000n]);
      await expect(
        preview.read({
          sourceName: "observation.images.test",
          startTimeNs: first.nextStartTimeNs,
        }),
      ).resolves.toMatchObject({
        frameTimeNs: 500_000_000n,
        status: "ready",
      });
    } finally {
      preview.dispose();
    }
  });

  it("keeps AV1 grid previews native while demuxing modal access units", async () => {
    const av1InfoBytes = new TextEncoder().encode(
      JSON.stringify({
        ...info,
        features: {
          ...info.features,
          "observation.images.test": {
            ...info.features["observation.images.test"],
            info: { "video.codec": "av1", "video.fps": 2 },
          },
        },
      }),
    );
    const av1Assets = assets.map((asset) => {
      if (asset.id === "info") {
        return {
          ...asset,
          metadata: { sizeBytes: av1InfoBytes.byteLength.toString() },
        };
      }
      if (asset.id === "video") {
        return {
          ...asset,
          metadata: {
            ...asset.metadata,
            sizeBytes: tinyAv1Mp4Bytes.byteLength.toString(),
          },
        };
      }
      return asset;
    });
    const av1Source: EpisodeSource = {
      ...source,
      assets: {
        list: async () => av1Assets,
        resolve: async (assetId) => ({
          ...descriptor(assetId),
          sizeBytes: av1Assets.find((asset) => asset.id === assetId)?.metadata
            ?.sizeBytes,
        }),
      },
    };
    const av1Io: ByteResources = {
      readBytes: async (request) => {
        const start = Number(request.range.offset);
        const end = start + Number(request.range.length);
        if (request.source.sourceId === "video") {
          return {
            bytes: tinyAv1Mp4Bytes.slice(start, end),
            range: request.range,
            source: request.source,
          };
        }
        if (request.source.sourceId !== "info") return io.readBytes(request);
        return {
          bytes: av1InfoBytes.slice(start, end),
          range: request.range,
          source: request.source,
        };
      },
    };
    const adapter = createLeRobotFormatAdapter({
      readParquetObjects,
    });
    const preview = await adapter.openPreview?.(av1Source, av1Io);
    if (!preview) throw new Error("LeRobot preview session is unavailable");
    try {
      await expect(
        preview.read({ sourceName: "observation.images.test" }),
      ).resolves.toMatchObject({
        frame: null,
        nativeVideo: {
          codec: "av1",
          codecString: expect.stringMatching(/^av01\./),
          endTimeSeconds: 1,
          source: { sourceId: "video", url: "memory://video" },
          startTimeSeconds: 0,
        },
        status: "ready",
        streamSourceName: "observation.images.test",
        streamSourceNames: [
          "observation.images.embedded",
          "observation.images.test",
        ],
      });
    } finally {
      preview.dispose();
    }

    const session = await adapter.open(av1Source, av1Io);
    try {
      expect(
        session.manifest.streams.find(
          (stream) => stream.id === "lerobot:observation.images.test",
        )?.metadata,
      ).toMatchObject({ "stream.decode_status": "decodable" });
      const batches = await collectBatches(
        session.read({
          streams: ["lerobot:observation.images.test"],
          window: session.manifest.timeRange,
        }),
      );
      expect(batches[0].frames[0].output.visualization).toMatchObject({
        codec: "av1",
        format: expect.stringMatching(/^av01\./),
        keyframe: true,
        kind: "encoded-video",
      });
      expect(batches[0].frames[0].output.visualization).not.toHaveProperty(
        "h264",
      );
      expect(
        batches[0].frames[0].output.resourceHints?.sizeBytes,
      ).toBeGreaterThan(0);
    } finally {
      session.dispose();
    }
  });

  it("keeps an MP4 boundary keyframe after nanosecond normalization", async () => {
    const boundaryAssets = assets.map((asset) =>
      asset.id === "video"
        ? {
            ...asset,
            selector: {
              fromTimestamp: Number.EPSILON,
              kind: "video-timestamp-interval" as const,
              toTimestamp: 1,
            },
          }
        : asset,
    );
    const boundarySource: EpisodeSource = {
      ...source,
      assets: {
        ...source.assets,
        list: async () => boundaryAssets,
      },
    };
    const preview = await createLeRobotFormatAdapter({
      readParquetObjects,
    }).openPreview?.(boundarySource, io);
    if (!preview) throw new Error("LeRobot preview session is unavailable");
    try {
      const result = await preview.read({
        sourceName: "observation.images.test",
      });
      expect(result).toMatchObject({
        frame: {
          image: {
            keyframe: true,
            timestampNs: 0n,
          },
          kind: "image",
        },
        frameTimeNs: 0n,
        status: "ready",
      });
    } finally {
      preview.dispose();
    }
  });
});

const realRoot = process.env.LEROBOT_DATASET_PATH;

describe.runIf(Boolean(realRoot))("LeRobot real-file walking slice", () => {
  it("reads the so-2crw Parquet slice and range-demuxes both H.264 cameras", async () => {
    if (!realRoot) throw new Error("LEROBOT_DATASET_PATH is required");
    const real = await realSource(realRoot);
    const session = await createLeRobotFormatAdapter().open(
      real.source,
      real.io,
    );
    try {
      expect(session.manifest.metadata?.["lerobot.codebaseVersion"]).toBe(
        "v3.0",
      );
      expect(
        session.manifest.streams.map((stream) => stream.sourceName),
      ).toEqual(
        expect.arrayContaining([
          "action",
          "observation.state",
          "observation.images.camera1",
          "observation.images.camera2",
        ]),
      );

      const signalBatches = await collectBatches(
        session.read({
          streams: ["lerobot:action"],
          window: { endNs: 100_000_000n, startNs: 0n },
        }),
      );
      expect(signalBatches[0].frames.length).toBeGreaterThanOrEqual(3);
      expect(signalBatches[0].frames[0].output.scalars).toHaveLength(6);

      const videoBatches = await collectBatches(
        session.read({
          priority: "current",
          streams: ["lerobot:observation.images.camera1"],
          window: { endNs: 200_000_000n, startNs: 0n },
        }),
      );
      expect(videoBatches[0].frames.length).toBeGreaterThanOrEqual(6);
      expect(videoBatches[0].frames[0].output.visualization).toMatchObject({
        codec: "h264",
        kind: "encoded-video",
        keyframe: true,
      });
      expect(
        videoBatches[0].frames[0].output.resourceHints?.sizeBytes,
      ).toBeGreaterThan(0);
      const stats = session.stats?.();
      if (!stats) throw new Error("LeRobot session stats are unavailable");
      expect(stats.transferredBytes).toBeLessThan(real.camera1SizeBytes);
    } finally {
      session.dispose();
      await real.close();
    }
  }, 30_000);
});

async function realSource(root: string): Promise<{
  camera1SizeBytes: number;
  close(): Promise<void>;
  io: ByteResources;
  source: EpisodeSource;
}> {
  const paths = {
    data: join(root, "data/chunk-000/file-000.parquet"),
    episodes: join(root, "meta/episodes/chunk-000/file-000.parquet"),
    info: join(root, "meta/info.json"),
    camera1: join(
      root,
      "videos/observation.images.camera1/chunk-000/file-000.mp4",
    ),
    camera2: join(
      root,
      "videos/observation.images.camera2/chunk-000/file-000.mp4",
    ),
  } as const;
  const entries = await Promise.all(
    Object.entries(paths).map(
      async ([id, path]) => [id, path, await stat(path)] as const,
    ),
  );
  const pathById = new Map(entries.map(([id, path]) => [id, path]));
  const filesById = new Map<string, ReturnType<typeof open>>();
  const sizeById = new Map(
    entries.map(([id, _path, metadata]) => [id, metadata.size.toString()]),
  );
  const realAssets: readonly AssetDescriptor[] = [
    {
      id: "info",
      mediaType: "application/json",
      metadata: { sizeBytes: requiredValue(sizeById, "info") },
      role: "dataset-info",
      selector: { kind: "whole-file" },
    },
    {
      id: "episodes",
      mediaType: "application/vnd.apache.parquet",
      metadata: { sizeBytes: requiredValue(sizeById, "episodes") },
      role: "episode-metadata",
      selector: {
        coordinateSystem: "parquet-file-row",
        end: 1,
        kind: "row-interval",
        start: 0,
      },
    },
    {
      id: "data",
      mediaType: "application/vnd.apache.parquet",
      metadata: {
        chunkIndex: "0",
        fileIndex: "0",
        sizeBytes: requiredValue(sizeById, "data"),
      },
      role: "tabular-frame-data",
      selector: {
        coordinateSystem: "parquet-file-row",
        end: 426,
        kind: "row-interval",
        start: 0,
      },
    },
    videoAsset(
      "camera1",
      "observation.images.camera1",
      requiredValue(sizeById, "camera1"),
    ),
    videoAsset(
      "camera2",
      "observation.images.camera2",
      requiredValue(sizeById, "camera2"),
    ),
  ];
  const resolve = async (id: string): Promise<ByteSourceDescriptor> => {
    const path = pathById.get(id);
    const sizeBytes = sizeById.get(id);
    if (!path || !sizeBytes) throw new Error(`Unknown real asset ${id}`);
    return { sizeBytes, sourceId: id, url: path };
  };
  return {
    camera1SizeBytes: Number(requiredValue(sizeById, "camera1")),
    close: async () => {
      await Promise.all(
        [...filesById.values()].map(async (file) => (await file).close()),
      );
      filesById.clear();
    },
    io: {
      async readBytes({ range, source: byteSource }) {
        const path = pathById.get(byteSource.sourceId);
        if (!path)
          throw new Error(`Unknown real source ${byteSource.sourceId}`);
        const length = Number(range.length);
        const offset = Number(range.offset);
        let file = filesById.get(byteSource.sourceId);
        if (!file) {
          file = open(path, "r");
          filesById.set(byteSource.sourceId, file);
        }
        const bytes = new Uint8Array(length);
        const { bytesRead } = await (await file).read(bytes, 0, length, offset);
        return {
          bytes: bytes.subarray(0, bytesRead),
          range,
          source: byteSource,
        };
      },
    },
    source: {
      assets: { list: async () => realAssets, resolve },
      episodeId: "episode-0",
    },
  };
}

function requiredValue<K, V>(values: ReadonlyMap<K, V>, key: K): V {
  const value = values.get(key);
  if (value === undefined)
    throw new Error(`Missing test value for ${String(key)}`);
  return value;
}

function videoAsset(
  id: string,
  stream: string,
  sizeBytes: string,
): AssetDescriptor {
  return {
    featureName: stream,
    id,
    mediaType: "video/mp4",
    metadata: {
      chunkIndex: "0",
      fileIndex: "0",
      sizeBytes,
      stream,
    },
    role: "video-stream",
    selector: {
      fromTimestamp: 0,
      kind: "video-timestamp-interval",
      toTimestamp: 14.2,
    },
  };
}

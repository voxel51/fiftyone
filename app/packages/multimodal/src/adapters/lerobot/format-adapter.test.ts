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
    "observation.state": {
      dtype: "float32",
      names: ["joint_a", "joint_b"],
      shape: [2],
    },
    "observation.images.test": {
      dtype: "video",
      info: { "video.codec": "h264", "video.fps": 2 },
      shape: [16, 16, 3],
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
const assets: readonly AssetDescriptor[] = [
  {
    id: "info",
    mediaType: "application/json",
    metadata: { sizeBytes: infoBytes.byteLength.toString() },
    role: "metadata",
  },
  {
    id: "episodes",
    mediaType: "application/vnd.apache.parquet",
    metadata: { sizeBytes: "1" },
    role: "episode-index",
  },
  {
    id: "data",
    mediaType: "application/vnd.apache.parquet",
    metadata: { chunkIndex: "0", fileIndex: "0", sizeBytes: "1" },
    role: "data",
  },
  {
    id: "video",
    mediaType: "video/mp4",
    metadata: {
      chunkIndex: "0",
      fileIndex: "0",
      sizeBytes: tinyMp4Bytes.byteLength.toString(),
      stream: "observation.images.test",
    },
    role: "video",
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
    frame_index: 0n,
    "observation.state": [3, 4],
    timestamp: 0,
  },
  {
    action: [5, 6],
    frame_index: 1n,
    "observation.state": [7, 8],
    timestamp: 0.033333335,
  },
  {
    action: [9, 10],
    frame_index: 2n,
    "observation.state": [11, 12],
    timestamp: 0.06666667,
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

const readParquetObjects = vi.fn(async (options: { columns?: string[] }) =>
  options.columns ? dataRows : [episodeRow],
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
        path: "/robot/run/meta/info.json",
      }),
    ).toBe(true);
    expect(
      detectLeRobotSample({
        mediaType: "application/x-lerobot",
        path: "/robot/run",
      }),
    ).toBe(true);
    expect(
      detectLeRobotSample({
        mediaType: "multimodal",
        path: "/robot/run/data.parquet",
      }),
    ).toBe(false);
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
      expect(readParquetObjects).toHaveBeenCalledTimes(2);
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

  it("activates a session on read and cancels the previous session", async () => {
    let releaseFirstRead = (_rows: Record<string, unknown>[]): void => {
      throw new Error("First data read did not start");
    };
    let dataReadCount = 0;
    const controlledReadParquet = vi.fn(
      async (options: { columns?: string[] }) => {
        if (!options.columns) return [episodeRow];
        dataReadCount += 1;
        if (dataReadCount > 1) return dataRows;
        return new Promise<Record<string, unknown>[]>((resolve) => {
          releaseFirstRead = resolve;
        });
      },
    );
    const adapter = createLeRobotFormatAdapter({
      readParquetObjects: controlledReadParquet,
    });
    const firstSession = await adapter.open(source, io);
    const secondSession = await adapter.open(source, io);
    const firstRead = collectBatches(
      firstSession.read({
        streams: ["lerobot:action"],
        window: firstSession.manifest.timeRange,
      }),
    );
    const secondRead = collectBatches(
      secondSession.read({
        streams: ["lerobot:action"],
        window: secondSession.manifest.timeRange,
      }),
    );

    await expect(secondRead).resolves.toHaveLength(1);
    releaseFirstRead(dataRows);
    await expect(firstRead).rejects.toSatisfy(isEpisodeReadCancelledError);
    firstSession.dispose();
    secondSession.dispose();
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
});

const realRoot = process.env.LEROBOT_DATASET_PATH;

describe.runIf(Boolean(realRoot))("LeRobot real-file walking slice", () => {
  it("reads Parquet signals and demuxes an AV1 MP4 GOP through the port", async () => {
    if (!realRoot) throw new Error("LEROBOT_DATASET_PATH is required");
    const real = await realSource(realRoot);
    let session: EpisodeSession | undefined;
    try {
      session = await createLeRobotFormatAdapter().open(real.source, real.io);
      expect(session.manifest.metadata?.["lerobot.codebaseVersion"]).toBe(
        "v3.0",
      );
      expect(
        session.manifest.streams.map((stream) => stream.sourceName),
      ).toEqual(
        expect.arrayContaining([
          "action",
          "observation.state",
          "observation.images.overhead",
          "observation.images.wrist",
        ]),
      );

      const signalBatches = await collectBatches(
        session.read({
          streams: ["lerobot:action"],
          window: { endNs: 100_000_000n, startNs: 0n },
        }),
      );
      expect(signalBatches[0].frames).toHaveLength(3);
      expect(signalBatches[0].frames[0].output.scalars).toHaveLength(6);

      const videoBatches = await collectBatches(
        session.read({
          priority: "current",
          streams: ["lerobot:observation.images.overhead"],
          window: { endNs: 200_000_000n, startNs: 0n },
        }),
      );
      expect(videoBatches[0].frames.length).toBeGreaterThanOrEqual(6);
      expect(videoBatches[0].frames[0].output.visualization).toMatchObject({
        codec: "av1",
        kind: "encoded-video",
        keyframe: true,
      });
      expect(
        videoBatches[0].frames[0].output.resourceHints?.sizeBytes,
      ).toBeGreaterThan(0);
    } finally {
      session?.dispose();
      await real.close();
    }
  }, 30_000);
});

async function realSource(root: string): Promise<{
  close(): Promise<void>;
  io: ByteResources;
  source: EpisodeSource;
}> {
  const paths = {
    data: join(root, "data/chunk-000/file-000.parquet"),
    episodes: join(root, "meta/episodes/chunk-000/file-000.parquet"),
    info: join(root, "meta/info.json"),
    overhead: join(
      root,
      "videos/observation.images.overhead/chunk-000/file-000.mp4",
    ),
    wrist: join(root, "videos/observation.images.wrist/chunk-000/file-000.mp4"),
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
      role: "metadata",
    },
    {
      id: "episodes",
      mediaType: "application/vnd.apache.parquet",
      metadata: { sizeBytes: requiredValue(sizeById, "episodes") },
      role: "episode-index",
    },
    {
      id: "data",
      mediaType: "application/vnd.apache.parquet",
      metadata: {
        chunkIndex: "0",
        fileIndex: "0",
        sizeBytes: requiredValue(sizeById, "data"),
      },
      role: "data",
    },
    videoAsset(
      "overhead",
      "observation.images.overhead",
      requiredValue(sizeById, "overhead"),
    ),
    videoAsset(
      "wrist",
      "observation.images.wrist",
      requiredValue(sizeById, "wrist"),
    ),
  ];
  const resolve = async (id: string): Promise<ByteSourceDescriptor> => {
    const path = pathById.get(id);
    const sizeBytes = sizeById.get(id);
    if (!path || !sizeBytes) throw new Error(`Unknown real asset ${id}`);
    return { sizeBytes, sourceId: id, url: path };
  };
  return {
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
    id,
    mediaType: "video/mp4",
    metadata: {
      chunkIndex: "0",
      fileIndex: "0",
      sizeBytes,
      stream,
    },
    role: "video",
  };
}

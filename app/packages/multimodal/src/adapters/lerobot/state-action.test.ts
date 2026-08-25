import { describe, expect, it, vi } from "vitest";

import type { ByteSourceDescriptor } from "../../ir";
import type {
  AssetDescriptor,
  ByteResources,
  EpisodeSource,
} from "../../ports";
import type { StateActionScenario } from "../fixture/fixture-state-action";
import { defineStateActionCapabilityContractTests } from "../../testing/state-action-contract";
import { createLeRobotFormatAdapter } from "./format-adapter";

interface BuildOptions {
  /** Absolute Parquet row where the episode's data interval begins. */
  readonly intervalStart?: number;
  /** Makes every tasks-metadata read reject. */
  readonly failTasksRead?: boolean;
}

interface ParquetReadOptions {
  columns?: string[];
  file: { byteLength: number };
  rowEnd?: number;
  rowStart?: number;
}

const EPISODES_BYTE_LENGTH = 1;
const DATA_BYTE_LENGTH = 2;
const TASKS_BYTE_LENGTH = 3;

function isSlabRead(options: ParquetReadOptions): boolean {
  return Boolean(
    options.columns?.includes("frame_index") &&
    options.columns.includes("task_index") &&
    !options.columns.includes("episode_index"),
  );
}

function buildStateActionSource(
  scenario: StateActionScenario,
  build: BuildOptions = {},
) {
  const rowCount = scenario.timestampsSeconds.length;
  const intervalStart = build.intervalStart ?? 0;
  const features: Record<string, unknown> = {
    success: { dtype: "bool", shape: [1] },
    timestamp: { dtype: "float32", shape: [1] },
  };
  if (scenario.state) {
    features["observation.state"] = {
      dtype: scenario.state.dtype,
      ...(scenario.state.names ? { names: scenario.state.names } : {}),
      shape: scenario.state.shape,
    };
  }
  if (scenario.action) {
    features.action = {
      dtype: scenario.action.dtype,
      ...(scenario.action.names ? { names: scenario.action.names } : {}),
      shape: scenario.action.shape,
    };
  }
  const info = {
    codebase_version: "v3.0",
    features,
    fps: 30,
    robot_type: "test-arm",
  };
  const infoBytes = new TextEncoder().encode(JSON.stringify(info));
  const episodeRow = {
    dataset_from_index: 0n,
    dataset_to_index: BigInt(rowCount),
    episode_index: 0n,
    length: BigInt(rowCount),
    tasks: scenario.episodeTasks ? [...scenario.episodeTasks] : [],
  };
  const dataRows = scenario.timestampsSeconds.map((timestamp, offset) => ({
    ...(scenario.action ? { action: scenario.action.rows[offset] } : {}),
    episode_index: 0n,
    frame_index: BigInt(offset),
    index: BigInt(offset),
    ...(scenario.state
      ? { "observation.state": scenario.state.rows[offset] }
      : {}),
    success: true,
    task_index: BigInt(scenario.taskIndexes?.[offset] ?? 0),
    timestamp,
  }));
  const taskRows = Object.entries(scenario.taskLabelsByIndex ?? {}).map(
    ([index, task]) => ({ task, task_index: BigInt(index) }),
  );
  const assets: AssetDescriptor[] = [
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
      metadata: { sizeBytes: EPISODES_BYTE_LENGTH.toString() },
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
      metadata: { sizeBytes: DATA_BYTE_LENGTH.toString() },
      role: "tabular-frame-data",
      selector: {
        coordinateSystem: "parquet-file-row",
        end: intervalStart + rowCount,
        kind: "row-interval",
        start: intervalStart,
      },
    },
    ...(scenario.taskLabelsByIndex
      ? [
          {
            id: "tasks",
            mediaType: "application/vnd.apache.parquet",
            metadata: { sizeBytes: TASKS_BYTE_LENGTH.toString() },
            role: "tasks-metadata",
            selector: { kind: "whole-file" } as const,
          },
        ]
      : []),
  ];
  let slabReads = 0;
  const reader = vi.fn(async (options: ParquetReadOptions) => {
    if (options.file.byteLength === TASKS_BYTE_LENGTH) {
      if (build.failTasksRead) {
        throw new Error("tasks metadata is unreadable");
      }
      return taskRows;
    }
    if (options.file.byteLength === EPISODES_BYTE_LENGTH) {
      return [episodeRow];
    }
    if (isSlabRead(options)) {
      slabReads += 1;
      if (scenario.fillLatencyMs) {
        await new Promise((resolve) =>
          setTimeout(resolve, scenario.fillLatencyMs),
        );
      }
    }
    const start = (options.rowStart ?? intervalStart) - intervalStart;
    const end = (options.rowEnd ?? intervalStart + rowCount) - intervalStart;
    return dataRows.slice(start, end);
  });
  const source: EpisodeSource = {
    assets: {
      list: async () => assets,
      resolve: async (assetId) => descriptor(assets, assetId),
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
          : new Uint8Array(Number(range.length));
      return { bytes, range, source: byteSource };
    },
  };
  return {
    io,
    physicalReads: () => slabReads,
    reader,
    source,
  };
}

function descriptor(
  assets: readonly AssetDescriptor[],
  assetId: string,
): ByteSourceDescriptor {
  const asset = assets.find((candidate) => candidate.id === assetId);
  if (!asset) throw new Error(`Unknown test asset ${assetId}`);
  return {
    sizeBytes: asset.metadata?.sizeBytes,
    sourceId: asset.id,
    url: `memory://${asset.id}`,
  };
}

defineStateActionCapabilityContractTests({
  createSession: async (scenario) => {
    const built = buildStateActionSource(scenario);
    const session = await createLeRobotFormatAdapter({
      readParquetObjects: built.reader,
    }).open(built.source, built.io);
    if (!session.stateAction) {
      throw new Error("LeRobot session did not expose the capability");
    }
    return {
      capability: session.stateAction,
      declaredEndNs: session.manifest.timeRange.endNs,
      dispose: () => session.dispose(),
      physicalReads: built.physicalReads,
    };
  },
  name: "lerobot",
});

const BASIC_SCENARIO: StateActionScenario = {
  action: {
    dtype: "float32",
    rows: [
      [1, 2],
      [3, 4],
      [5, 6],
    ],
    shape: [2],
  },
  state: {
    dtype: "float32",
    names: ["shoulder", "elbow"],
    rows: [
      [0.1, 0.2],
      [1.1, 1.2],
      [2.1, 2.2],
    ],
    shape: [2],
  },
  timestampsSeconds: [0, 0.05, 0.1],
};

describe("LeRobot state/action provider", () => {
  it("omits the capability when neither canonical feature is declared", async () => {
    const built = buildStateActionSource({
      timestampsSeconds: [0, 0.05],
    });
    const session = await createLeRobotFormatAdapter({
      readParquetObjects: built.reader,
    }).open(built.source, built.io);
    try {
      expect(session.stateAction).toBeUndefined();
    } finally {
      session.dispose();
    }
  });

  it("fills one slab selecting only the declared columns over the episode interval", async () => {
    const built = buildStateActionSource(BASIC_SCENARIO);
    const session = await createLeRobotFormatAdapter({
      readParquetObjects: built.reader,
    }).open(built.source, built.io);
    try {
      await session.stateAction?.readAtTime({ timestampNs: 0n });
      const slabCall = built.reader.mock.calls.find(([options]) =>
        isSlabRead(options),
      );
      expect(slabCall?.[0]).toMatchObject({
        columns: [
          "timestamp",
          "frame_index",
          "task_index",
          "observation.state",
          "action",
        ],
        rowEnd: 3,
        rowStart: 0,
      });
      for (const [options] of built.reader.mock.calls) {
        expect(options.columns ?? []).not.toContain(
          "observation.images.embedded",
        );
      }
    } finally {
      session.dispose();
    }
  });

  it("translates the slab to absolute rows for an offset episode interval", async () => {
    const built = buildStateActionSource(BASIC_SCENARIO, { intervalStart: 10 });
    const session = await createLeRobotFormatAdapter({
      readParquetObjects: built.reader,
    }).open(built.source, built.io);
    try {
      const row = await session.stateAction?.readAtTime({ timestampNs: 0n });
      expect(row?.state).toEqual([0.1, 0.2]);
      const slabCall = built.reader.mock.calls.find(([options]) =>
        isSlabRead(options),
      );
      expect(slabCall?.[0]).toMatchObject({ rowEnd: 13, rowStart: 10 });
    } finally {
      session.dispose();
    }
  });

  it("keeps rows readable when the tasks asset cannot be read", async () => {
    const built = buildStateActionSource(
      {
        ...BASIC_SCENARIO,
        episodeTasks: ["pick up the block"],
        taskIndexes: [0, 0, 1],
        taskLabelsByIndex: { 0: "unused", 1: "unused" },
      },
      { failTasksRead: true },
    );
    const session = await createLeRobotFormatAdapter({
      readParquetObjects: built.reader,
    }).open(built.source, built.io);
    try {
      const row = await session.stateAction?.readAtCursor({ cursor: "row:2" });
      expect(row?.state).toEqual([2.1, 2.2]);
      expect(row?.task).toEqual({ index: 1, label: "pick up the block" });
    } finally {
      session.dispose();
    }
  });

  it("degrades to bounded block reads when the slab exceeds its ceiling", async () => {
    const built = buildStateActionSource(BASIC_SCENARIO);
    const session = await createLeRobotFormatAdapter({
      readParquetObjects: built.reader,
      // rowBytes = 24 + 2×4 + 2×4 = 40; three rows exceed 100 bytes, and a
      // 90-byte block budget admits two rows per physical read.
      stateActionSlabLimits: { blockBytes: 90, maxSingleSlabBytes: 100 },
    }).open(built.source, built.io);
    try {
      const first = await session.stateAction?.readAtCursor({
        cursor: "row:0",
      });
      expect(first?.state).toEqual([0.1, 0.2]);
      expect(built.physicalReads()).toBe(1);
      const last = await session.stateAction?.readAtCursor({ cursor: "row:2" });
      expect(last?.state).toEqual([2.1, 2.2]);
      expect(built.physicalReads()).toBe(2);
      const slabCalls = built.reader.mock.calls
        .filter(([options]) => isSlabRead(options))
        .map(([options]) => [options.rowStart, options.rowEnd]);
      expect(slabCalls).toEqual([
        [0, 2],
        [2, 3],
      ]);
      await session.stateAction?.readAtCursor({ cursor: "row:1" });
      expect(built.physicalReads()).toBe(2);
    } finally {
      session.dispose();
    }
  });
});

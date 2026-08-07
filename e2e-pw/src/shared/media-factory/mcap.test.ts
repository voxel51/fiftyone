/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { McapIndexedReader, type McapTypes } from "@mcap/core";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MAX_LONG_MCAP_SIZE_BYTES,
  createMcapFixture,
  type McapFixtureReport,
} from "./mcap";

const EPOCH_START_NS = 1_704_067_200_000_000_000n;
const SECOND_NS = 1_000_000_000n;

describe("MCAP correctness fixtures", () => {
  let outputDir: string;
  let reports: Record<string, McapFixtureReport>;

  beforeAll(async () => {
    outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "fo-mcap-fixtures-"));
    reports = {};
    for (const kind of [
      "tiny-episode-a",
      "tiny-episode-b",
      "unsupported",
      "long-mixed-episode",
    ] as const) {
      reports[kind] = await createMcapFixture({
        kind,
        outputPath: path.join(outputDir, kind + ".mcap"),
      });
    }
  }, 60_000);

  afterAll(async () => {
    await fs.rm(outputDir, { force: true, recursive: true });
  });

  it("writes deterministic indexed uncompressed tiny fixtures", async () => {
    const secondPath = path.join(outputDir, "tiny-episode-a-copy.mcap");
    await createMcapFixture({
      kind: "tiny-episode-a",
      outputPath: secondPath,
    });

    const [first, second] = await Promise.all([
      fs.readFile(reports["tiny-episode-a"].outputPath),
      fs.readFile(secondPath),
    ]);
    expect(first).toEqual(second);

    const reader = await openReader(first);
    expect(reader.chunkIndexes.length).toBeGreaterThan(0);
    expect(reader.chunkIndexes.every((chunk) => chunk.compression === "")).toBe(
      true,
    );
    expect(
      reader.chunkIndexes.every((chunk) => chunk.messageIndexOffsets.size > 0),
    ).toBe(true);
    expect(topics(reader)).toEqual([
      "/camera/front",
      "/log",
      "/points",
      "/pose",
    ]);
  });

  it("preserves fixture A tick values and absolute time", async () => {
    const reader = await openReader(
      await fs.readFile(reports["tiny-episode-a"].outputPath),
    );
    const messages = await readMessages(reports["tiny-episode-a"].outputPath);
    expect(reports["tiny-episode-a"].messageCounts).toEqual({
      "/camera/front": 3,
      "/log": 3,
      "/points": 3,
      "/pose": 3,
    });
    expect(messages[0].logTime).toBe(EPOCH_START_NS);
    expect(messages.at(-1)?.logTime).toBe(EPOCH_START_NS + 2n * SECOND_NS);
    expect(channel(reader, "/camera/front").metadata.get("timeline_mode")).toBe(
      "absolute",
    );
    expect(jsonMessages(messages, "/pose")[1]).toMatchObject({
      position: { x: 10, y: 2, z: 3 },
      velocity: { x: 2, y: 0, z: 0 },
    });
    expect(jsonMessages(messages, "/log")[2]).toMatchObject({ msg: "A log 2" });
  });

  it("keeps asymmetric fixture B relative, half-second, and A-free", async () => {
    const reader = await openReader(
      await fs.readFile(reports["tiny-episode-b"].outputPath),
    );
    const messages = await readMessages(reports["tiny-episode-b"].outputPath);
    expect(reports["tiny-episode-b"].messageCounts).toEqual({
      "/camera/rear": 4,
      "/camera/side": 4,
      "/scan/rear": 4,
      "/status": 4,
    });
    expect(new Set(messages.map((message) => message.logTime))).toEqual(
      new Set([0n, 500_000_000n, 1_000_000_000n, 1_500_000_000n]),
    );
    expect(channel(reader, "/camera/rear").metadata.has("timeline_mode")).toBe(
      false,
    );
    expect(jsonMessages(messages, "/status")[3]).toEqual({
      mode: "ready",
      status_code: 203,
      tick: 3,
      vehicle: { gear: "reverse" },
    });
  });

  it("keeps unsupported valid but without a previewable schema", async () => {
    const messages = await readMessages(reports.unsupported.outputPath);
    expect(reports.unsupported.messageCounts).toEqual({ "/unsupported": 1 });
    expect(jsonMessages(messages, "/unsupported")[0]).toEqual({
      note: "valid JSON with no previewable decoder",
      value: 17,
    });
  });

  it("builds the one-hour mixed episode under its hard guard", async () => {
    const report = reports["long-mixed-episode"];
    expect(report.sizeBytes).toBeGreaterThanOrEqual(6.5 * 1024 * 1024);
    expect(report.sizeBytes).toBeLessThanOrEqual(MAX_LONG_MCAP_SIZE_BYTES);
    expect(report.messageCounts).toEqual({
      "/camera/front": 7_200,
      "/camera/front/detections": 1_800,
      "/camera/rear": 1_200,
      "/diagnostics": 60,
      "/lidar/points": 1_789,
      "/odometry": 3_600,
      "/rosout": 19,
      "/scan/rear": 360,
      "/status": 721,
      "/tf": 3_600,
      "/tf_static": 1,
    });

    const messages = await readMessages(report.outputPath);
    const reader = await openReader(await fs.readFile(report.outputPath));
    expect(messages[0].logTime).toBe(EPOCH_START_NS);
    expect(messages.at(-1)?.logTime).toBe(EPOCH_START_NS + 3_600n * SECOND_NS);
    expect(channel(reader, "/camera/front").metadata.get("timeline_mode")).toBe(
      "absolute",
    );
    expect(channel(reader, "/tf_static").metadata.get("timeline_mode")).toBe(
      "absolute",
    );
    expect(
      messages.filter((message) => message.topic === "/tf_static"),
    ).toEqual([
      expect.objectContaining({ logTime: EPOCH_START_NS, topic: "/tf_static" }),
    ]);
    const logTimes = messages
      .filter((message) => message.topic === "/rosout")
      .map((message) => message.logTime);
    expect(new Set(logTimes).size).toBe(logTimes.length);
    expect(logTimes).toContain(EPOCH_START_NS + 1_800n * SECOND_NS);
    expect(logTimes).toContain(EPOCH_START_NS + 3_600n * SECOND_NS);
    const lidarTimes = messages
      .filter((message) => message.topic === "/lidar/points")
      .map((message) => message.logTime);
    expect(lidarTimes).toContain(EPOCH_START_NS + 1_788n * SECOND_NS);
    expect(lidarTimes).not.toContain(EPOCH_START_NS + 1_800n * SECOND_NS);
    expect(lidarTimes).toContain(EPOCH_START_NS + 1_812n * SECOND_NS);

    const statuses = jsonMessages(messages, "/status");
    expect(statuses.at(-1)).toEqual({
      counter: 720,
      phase: 3,
      state: "complete",
      terminal: true,
    });
    expect(jsonMessages(messages, "/odometry")[1_800]).toMatchObject({
      pose: { pose: { position: { x: 180, y: 0, z: 1 } } },
      twist: { twist: { linear: { x: 10, y: 0, z: 0 } } },
    });
  });
});

interface ReadMessage extends McapTypes.Message {
  readonly topic: string;
}

async function readMessages(filePath: string): Promise<readonly ReadMessage[]> {
  const reader = await openReader(await fs.readFile(filePath));
  const messages: ReadMessage[] = [];
  for await (const message of reader.readMessages()) {
    const topic = reader.channelsById.get(message.channelId)?.topic;
    if (!topic) throw new Error("fixture message has no channel topic");
    messages.push({ ...message, topic });
  }
  return messages;
}

function jsonMessages(
  messages: readonly ReadMessage[],
  topic: string,
): readonly Record<string, unknown>[] {
  return messages
    .filter((message) => message.topic === topic)
    .map((message) => JSON.parse(new TextDecoder().decode(message.data)));
}

async function openReader(bytes: Uint8Array): Promise<McapIndexedReader> {
  return McapIndexedReader.Initialize({ readable: new BufferReadable(bytes) });
}

function topics(reader: McapIndexedReader): readonly string[] {
  return [...reader.channelsById.values()]
    .map((channel) => channel.topic)
    .sort();
}

function channel(
  reader: McapIndexedReader,
  topic: string,
): McapTypes.TypedMcapRecords["Channel"] {
  const value = [...reader.channelsById.values()].find(
    (candidate) => candidate.topic === topic,
  );
  if (!value) throw new Error(`fixture has no ${topic} channel`);
  return value;
}

class BufferReadable implements McapTypes.IReadable {
  constructor(private readonly bytes: Uint8Array) {}

  async read(offset: bigint, size: bigint): Promise<Uint8Array> {
    return this.bytes.subarray(Number(offset), Number(offset + size));
  }

  async size(): Promise<bigint> {
    return BigInt(this.bytes.byteLength);
  }
}

import { describe, expect, it } from "vitest";
import { VISUALIZATION_KIND } from "../../../../ir";
import type { DecodeClient } from "../../../../query/decoding";
import { createDefaultMcapReader } from "../../reader";
import { ByteClientReadable } from "../../reader/byte-readable";
import { resolveMcapTimelineStrategy } from "../timeline";
import {
  buildDisconnectedTransformTopologyMcap,
  buildHealthyTransformTopologyMcap,
} from "../transform-topology.test-fixtures";
import { readMcapTransformTopology } from "./read-transform-topology";

const GENEROUS_BUDGET = {
  maxMessages: 100,
  maxSourceBytes: 16 * 1024 * 1024,
  maxUncompressedBytes: 32 * 1024 * 1024,
  maxWallTimeMs: 5_000,
};

describe("MCAP transform topology acquisition", () => {
  it("reads a healthy connected fixture with static and temporal edges", async () => {
    const fixture = await buildHealthyTransformTopologyMcap();
    const result = await readFixture(fixture, GENEROUS_BUDGET);

    expect(result.stopReason).toBe("source-exhausted");
    expect(result.continuation).toBeUndefined();
    expect(result.edges).toEqual([
      expect.objectContaining({
        childFrameId: "lidar",
        kind: "temporal",
        occurrenceCount: 2,
        parentFrameId: "base_link",
        sourceName: "/tf",
      }),
      expect.objectContaining({
        childFrameId: "base_link",
        kind: "static",
        occurrenceCount: 1,
        parentFrameId: "map",
        sourceName: "/tf_static",
      }),
    ]);
    expect(result.frameUses).toEqual([
      {
        frameId: "map",
        sourceName: "/pose/map",
        streamId: "/pose/map",
      },
    ]);
  });

  it("retains both components in a disconnected fixture", async () => {
    const fixture = await buildDisconnectedTransformTopologyMcap();
    const result = await readFixture(fixture, GENEROUS_BUDGET);

    expect(result.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          childFrameId: "camera",
          parentFrameId: "world",
        }),
        expect.objectContaining({
          childFrameId: "lidar",
          parentFrameId: "base_link",
        }),
      ]),
    );
    expect(result.frameUses.map((use) => use.frameId)).toEqual([
      "camera",
      "map",
    ]);
  });

  it("caps competing frame-use topics while retaining every transform topic", async () => {
    const fixture = await buildHealthyTransformTopologyMcap();
    let requestedTopics: readonly string[] | undefined;
    await readFixture(fixture, GENEROUS_BUDGET, undefined, {
      frameUseTopics: ["/use/f", "/use/e", "/use/d", "/use/c", "/use/b"],
      onTopics: (topics) => {
        requestedTopics = topics;
      },
    });

    expect(requestedTopics).toEqual([
      "/tf",
      "/tf_static",
      "/use/b",
      "/use/c",
      "/use/d",
      "/use/e",
    ]);
  });

  it("reports an oversized source unit as partial without widening the grant", async () => {
    const fixture = await buildHealthyTransformTopologyMcap();
    const result = await readFixture(fixture, {
      ...GENEROUS_BUDGET,
      maxSourceBytes: 1,
      maxUncompressedBytes: 1,
    });

    expect(result.stopReason).toBe("oversized-source-unit");
    expect(result.edges).toEqual([]);
    expect(result.unavailableByTopic?.size).toBeGreaterThan(0);
  });

  it("honors cancellation before source work", async () => {
    const fixture = await buildHealthyTransformTopologyMcap();
    const controller = new AbortController();
    controller.abort();

    try {
      await readFixture(fixture, GENEROUS_BUDGET, controller.signal);
      throw new Error("Expected transform topology cancellation");
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      expect(error.name).toMatch(/Abort|Cancel/);
    }
  });
});

async function readFixture(
  fixture: Awaited<ReturnType<typeof buildHealthyTransformTopologyMcap>>,
  budget: typeof GENEROUS_BUDGET,
  signal?: AbortSignal,
  options?: {
    readonly frameUseTopics?: readonly string[];
    readonly onTopics?: (topics: readonly string[]) => void;
  },
) {
  const source = {
    sizeBytes: fixture.sizeBytes,
    sourceId: "transform-topology-fixture",
    url: "memory://transform-topology-fixture.mcap",
  };
  const reader = await createDefaultMcapReader(
    source,
    new ByteClientReadable(source, {
      readBytes: async (request) => ({
        bytes: await fixture.readable.read(
          request.range.offset,
          request.range.length,
        ),
        range: request.range,
        source: request.source,
      }),
    }),
  );
  try {
    const readBoundedMessages = reader.readBoundedMessages?.bind(reader);
    if (readBoundedMessages && options?.onTopics) {
      reader.readBoundedMessages = (request) => {
        options.onTopics?.(request.topics ?? []);
        return readBoundedMessages(request);
      };
    }
    return await readMcapTransformTopology({
      decodeClient: POSE_DECODE_CLIENT,
      reader,
      request: {
        absoluteBudget: GENEROUS_BUDGET,
        absoluteMaxChunks: 4,
        budget,
        endTimeNs: 4_000_000_000n,
        frameUseTopics: options?.frameUseTopics ?? fixture.frameUseTopics,
        maxChunks: 4,
        source,
        startTimeNs: 0n,
      },
      signal,
      timeline: resolveMcapTimelineStrategy(undefined),
    });
  } finally {
    reader.dispose?.();
  }
}

const POSE_DECODE_CLIENT: DecodeClient = {
  cachesDecodedOutput: false,
  decode: (request) =>
    Promise.resolve({
      decoderId: "topology-test-pose",
      decoderVersion: "1",
      output: {
        visualization: {
          // The fixture writes a short PoseInFrame.frameId, whose one-byte field
          // tag and length prefix occupy the first two bytes.
          coordinateFrameId: new TextDecoder().decode(
            request.bytes.subarray(2),
          ),
          kind: VISUALIZATION_KIND.POSE,
          position: [0, 0, 0],
          quaternion: [0, 0, 0, 1],
        },
      },
      payload: request.payload,
    }),
};

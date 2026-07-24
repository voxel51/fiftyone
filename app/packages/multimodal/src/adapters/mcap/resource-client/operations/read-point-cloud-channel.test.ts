import type { McapTypes } from "@mcap/core";
import { describe, expect, it, vi } from "vitest";

import {
  DecoderRegistry,
  type DecodeContext,
  type PointCloudChannelProjectionRequest,
} from "../../../../decoders";
import type { PointCloudRenderChannelPayload } from "../../../../ir";
import type { McapIndexedReaderLike } from "../../reader";
import { MCAP_ACTIVE_TIMELINE } from "../../contracts";
import { resolveMcapTimelineStrategy } from "../timeline";
import { readMcapPointCloudChannel } from "./read-point-cloud-channel";

describe("readMcapPointCloudChannel", () => {
  it("projects the exact message over the caller's geometry plan", async () => {
    const sourceIndices = new Uint32Array([1, 3]);
    const projectPointCloudChannel = vi.fn(
      (
        _bytes: Uint8Array,
        _context: DecodeContext,
        request: PointCloudChannelProjectionRequest,
      ): PointCloudRenderChannelPayload => ({
        kind: "scalar",
        samplePlanKey: request.samplePlanKey,
        scalarField: {
          finiteValueCount: 2,
          name: request.activeColorBy,
          range: { max: 8, min: 7 },
          values: new Float32Array([7, 8]),
        },
      }),
    );
    const decoderRegistry = new DecoderRegistry();
    decoderRegistry.register({
      decode: vi.fn(),
      id: "point-cloud-test",
      payload: {
        encoding: "protobuf",
        schema: "example.PointCloud",
        schemaEncoding: "protobuf",
      },
      projectPointCloudChannel,
      version: "1",
    });
    const readMessages = vi.fn(async function* () {
      yield message(99n);
      yield message(100n);
    });
    const reader = {
      channelsById: new Map([
        [
          7,
          {
            id: 7,
            messageEncoding: "protobuf",
            metadata: new Map(),
            schemaId: 3,
            topic: "/lidar",
            type: "Channel",
          } satisfies McapTypes.TypedMcapRecords["Channel"],
        ],
      ]),
      chunkIndexes: [],
      readMessages,
      schemasById: new Map([
        [
          3,
          {
            data: new Uint8Array([9]),
            encoding: "protobuf",
            id: 3,
            name: "example.PointCloud",
            type: "Schema",
          } satisfies McapTypes.TypedMcapRecords["Schema"],
        ],
      ]),
    } satisfies McapIndexedReaderLike;

    const result = await readMcapPointCloudChannel({
      decoderRegistry,
      reader,
      request: {
        activeColorBy: "ring",
        capacity: 1_024,
        samplePlanKey: "4:2",
        sampledPointCount: 2,
        source: {
          sizeBytes: "1",
          sourceId: "source",
          url: "https://example.com/source.mcap",
        },
        sourceIndices,
        timeNs: 100n,
        topic: "/lidar",
      },
      timeline: resolveMcapTimelineStrategy(MCAP_ACTIVE_TIMELINE.LOG),
    });

    expect(readMessages).toHaveBeenCalledWith({
      endTime: 100n,
      startTime: 100n,
      topics: ["/lidar"],
    });
    expect(projectPointCloudChannel).toHaveBeenCalledOnce();
    expect(projectPointCloudChannel).toHaveBeenCalledWith(
      new Uint8Array([1, 2, 3]),
      expect.objectContaining({
        pointCloudColorBy: "ring",
        streamId: "/lidar",
      }),
      {
        activeColorBy: "ring",
        capacity: 1_024,
        sampledPointCount: 2,
        samplePlanKey: "4:2",
        sourceIndices,
      },
    );
    expect(result).toMatchObject({
      kind: "scalar",
      samplePlanKey: "4:2",
      scalarField: { name: "ring" },
    });
  });
});

function message(logTime: bigint): McapTypes.TypedMcapRecords["Message"] {
  return {
    channelId: 7,
    data: new Uint8Array([1, 2, 3]),
    logTime,
    publishTime: logTime,
    sequence: 0,
    type: "Message",
  };
}

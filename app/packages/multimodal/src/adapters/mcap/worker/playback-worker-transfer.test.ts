import { describe, expect, it } from "vitest";
import { transferablesForMcapResult } from "./playback-worker-transfer";
import type {
  McapDecodedMessage,
  McapSynchronizedMessageWindow,
  McapTimelineRange,
} from "../types";

describe("MCAP playback worker transfer collection", () => {
  it("collects encoded image and point-cloud buffers", () => {
    const image = new Uint8Array([1, 2, 3]);
    const positions = new Float32Array([1, 2, 3]);
    const window = createWindow([
      createMessage([image.buffer]),
      createMessage([positions.buffer]),
    ]);

    expect(transferablesForMcapResult(window)).toEqual([
      image.buffer,
      positions.buffer,
    ]);
  });

  it("keeps timeline ranges cloneable without transferables", () => {
    expect(transferablesForMcapResult(createTimelineRange())).toEqual([]);
  });

  it("keeps topic inventories cloneable without transferables", () => {
    expect(
      transferablesForMcapResult([
        {
          metadata: { "mcap.topic": "/camera" },
          payload: { encoding: "protobuf" },
          streamId: "/camera",
        },
      ]),
    ).toEqual([]);
  });

  it("ignores decoded-message-shaped values with invalid resource hints", () => {
    expect(transferablesForMcapResult({ decoded: null })).toEqual([]);
    expect(
      transferablesForMcapResult({
        decoded: {
          output: {
            resourceHints: {
              transferables: null,
            },
          },
        },
      }),
    ).toEqual([]);
  });
});

function createTimelineRange(): McapTimelineRange {
  return {
    activeTimeline: "log",
    endTimeNs: 2n,
    startTimeNs: 1n,
  };
}

function createWindow(
  messages: readonly McapDecodedMessage[],
): McapSynchronizedMessageWindow {
  return {
    activeTimeline: "log",
    endTimeNs: 1n,
    messages,
    messagesByTopic: {},
    startTimeNs: 1n,
    streamPolicies: {},
    timeNs: 1n,
  };
}

function createMessage(
  transferables: readonly Transferable[],
): McapDecodedMessage {
  return {
    channelId: 1,
    decoded: {
      decoderId: "decoder",
      decoderVersion: "1",
      output: {
        attributes: {},
        resourceHints: {
          transferables,
        },
      },
      payload: {
        encoding: "protobuf",
      },
    },
    logTimeNs: 1n,
    publishTimeNs: 1n,
    sequence: 1,
    activeTimeline: "log",
    timelineTimeNs: 1n,
    topic: "/topic",
  };
}

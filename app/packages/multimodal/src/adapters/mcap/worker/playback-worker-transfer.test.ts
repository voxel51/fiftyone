import { describe, expect, it } from "vitest";
import { transferablesForMcapResult } from "./playback-worker-transfer";
import type {
  McapDecodedMessage,
  McapSynchronizedMessageWindow,
  McapTimelineRange,
} from "../contracts/index";

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

  it("collects native-width point-cloud channel replacements", () => {
    const rgb = new Uint8Array([255, 128, 0]);
    const scalar = new Uint16Array([1_000, 65_000]);

    expect(
      transferablesForMcapResult({
        kind: "rgb",
        rgb: {
          encoding: {
            componentCount: 3,
            invalidValue: null,
            origin: 0,
            scale: 1 / 255,
            storage: "uint8",
          },
          values: rgb,
        },
        samplePlanKey: "rgb-plan",
      }),
    ).toEqual([rgb.buffer]);
    expect(
      transferablesForMcapResult({
        kind: "scalar",
        samplePlanKey: "scalar-plan",
        scalarField: {
          encoding: {
            componentCount: 1,
            invalidValue: null,
            origin: 0,
            scale: 1,
            storage: "uint16",
          },
          finiteValueCount: 2,
          name: "ring",
          range: { max: 65_000, min: 1_000 },
          values: scalar,
        },
      }),
    ).toEqual([scalar.buffer]);
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

  it("does not transfer buffers for retained decoded-record references", () => {
    expect(
      transferablesForMcapResult({
        messages: [
          {
            kind: "retained-decoded-message",
            recordId: "record",
            timelineTimeNs: 1n,
            topic: "/camera",
          },
        ],
      }),
    ).toEqual([]);
  });

  it("filters retained references from an array of mixed windows", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const retained = {
      kind: "retained-decoded-message" as const,
      recordId: "record",
      timelineTimeNs: 1n,
      topic: "/camera",
    };
    const fresh = createMessage([bytes.buffer]);

    expect(
      transferablesForMcapResult([
        { ...createWindow([fresh]), messages: [retained, fresh] },
      ]),
    ).toEqual([bytes.buffer]);
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

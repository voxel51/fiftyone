import { describe, expect, it } from "vitest";
import { VISUALIZATION_KIND } from "../../visualization";
import { transferablesForMcapResult } from "./playback-worker-transfer";
import type {
  McapDecodedMessage,
  McapSynchronizedMessageWindow,
} from "../types";

describe("MCAP playback worker transfer collection", () => {
  it("collects encoded image and point-cloud buffers", () => {
    const image = new Uint8Array([1, 2, 3]);
    const positions = new Float32Array([1, 2, 3]);
    const window = createWindow([
      createMessage({
        bytes: image,
        kind: VISUALIZATION_KIND.ENCODED_IMAGE,
      }),
      createMessage({
        kind: VISUALIZATION_KIND.POINT_CLOUD,
        positions,
      }),
    ]);

    expect(transferablesForMcapResult(window)).toEqual([
      image.buffer,
      positions.buffer,
    ]);
  });

  it("keeps metadata-only results cloneable without transferables", () => {
    expect(transferablesForMcapResult([1n, 2n])).toEqual([]);
  });
});

function createWindow(
  messages: readonly McapDecodedMessage[]
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
  visualization:
    | {
        readonly bytes: Uint8Array;
        readonly kind: typeof VISUALIZATION_KIND.ENCODED_IMAGE;
      }
    | {
        readonly kind: typeof VISUALIZATION_KIND.POINT_CLOUD;
        readonly positions: Float32Array;
      }
): McapDecodedMessage {
  return {
    channelId: 1,
    decoded: {
      decoderId: "decoder",
      decoderVersion: "1",
      output: {
        attributes: {},
        visualization:
          visualization.kind === VISUALIZATION_KIND.ENCODED_IMAGE
            ? {
                bytes: visualization.bytes,
                kind: visualization.kind,
              }
            : {
                fields: [],
                kind: visualization.kind,
                pointCount: visualization.positions.length / 3,
                positions: visualization.positions,
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

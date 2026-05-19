import { describe, expect, it } from "vitest";
import { PlaybackSyncMode } from "../../schemas/v1";
import { createWindowBounds, selectSynchronizedWindow } from "./sync";
import {
  MCAP_ACTIVE_TIMELINE,
  type McapDecodedMessage,
  type McapStreamSyncPolicies,
} from "./types";

describe("MCAP sync policy selection", () => {
  it("applies playback.proto sync modes per stream", () => {
    const topics = ["/camera", "/lidar", "/pose"];
    const policies: McapStreamSyncPolicies = {
      "/camera": {
        mode: PlaybackSyncMode.LATEST,
        toleranceBeforeNs: 20n,
      },
      "/lidar": {
        mode: PlaybackSyncMode.NEAREST,
        toleranceAfterNs: 20n,
        toleranceBeforeNs: 20n,
      },
      "/pose": {
        mode: PlaybackSyncMode.STRICT,
      },
    };
    const bounds = createWindowBounds({
      timeNs: 100n,
      streamPolicies: policies,
      topics,
    });

    const window = selectSynchronizedWindow({
      activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
      candidatesByTopic: new Map([
        [
          "/camera",
          [
            createDecodedMessage("/camera", 90n),
            createDecodedMessage("/camera", 110n),
          ],
        ],
        ["/lidar", [createDecodedMessage("/lidar", 108n)]],
        ["/pose", [createDecodedMessage("/pose", 100n)]],
      ]),
      streamPolicies: bounds.streamPolicies,
      timeNs: bounds.timeNs,
      topics,
    });

    expect(window.messagesByTopic["/camera"]?.[0]?.timelineTimeNs).toBe(90n);
    expect(window.messagesByTopic["/lidar"]?.[0]?.timelineTimeNs).toBe(108n);
    expect(window.messagesByTopic["/pose"]?.[0]?.timelineTimeNs).toBe(100n);
  });

  it("rejects fractional and non-finite stream limits", () => {
    for (const limit of [1.5, Number.NaN]) {
      expect(() =>
        createWindowBounds({
          timeNs: 100n,
          streamPolicies: {
            "/camera": {
              limit,
            },
          },
          topics: ["/camera"],
        })
      ).toThrow(
        "MCAP sync policy for /camera must request a positive integer frame limit"
      );
    }
  });
});

function createDecodedMessage(
  topic: string,
  timelineTimeNs: bigint
): McapDecodedMessage {
  return {
    activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
    channelId: 1,
    decoded: {
      decoderId: "decoder",
      decoderVersion: "1",
      output: {
        attributes: {},
      },
      payload: {
        encoding: "protobuf",
      },
    },
    logTimeNs: timelineTimeNs,
    publishTimeNs: timelineTimeNs,
    sequence: 1,
    timelineTimeNs,
    topic,
  };
}

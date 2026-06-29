import { describe, expect, it } from "vitest";
import { PlaybackSyncMode } from "../../schemas/v1";
import {
  createWindowBounds,
  isUnboundedLatestPolicy,
  selectSynchronizedWindow,
} from "./sync";
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

  it("defaults unspecified policies to unbounded latest-at-or-before", () => {
    const bounds = createWindowBounds({
      timeNs: 1_000_000n,
      topics: ["/sparse"],
    });
    const policy = bounds.streamPolicies["/sparse"];

    expect(policy.mode).toBe(PlaybackSyncMode.LATEST);
    expect(policy.startTimeNs).toBeUndefined();
    expect(policy.endTimeNs).toBe(1_000_000n);
    expect(isUnboundedLatestPolicy(policy)).toBe(true);

    const window = selectSynchronizedWindow({
      activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
      candidatesByTopic: new Map([
        [
          "/sparse",
          [
            // Arbitrarily old predecessor is selected; future data never is.
            createDecodedMessage("/sparse", 5n),
            createDecodedMessage("/sparse", 1_000_001n),
          ],
        ],
      ]),
      streamPolicies: bounds.streamPolicies,
      timeNs: bounds.timeNs,
      topics: ["/sparse"],
    });

    expect(window.messagesByTopic["/sparse"]).toHaveLength(1);
    expect(window.messagesByTopic["/sparse"]?.[0]?.timelineTimeNs).toBe(5n);
  });

  it("keeps bounded lookback for latest policies with an explicit tolerance", () => {
    const bounds = createWindowBounds({
      timeNs: 100n,
      streamPolicies: {
        "/camera": {
          mode: PlaybackSyncMode.LATEST,
          toleranceBeforeNs: 20n,
        },
      },
      topics: ["/camera"],
    });
    const policy = bounds.streamPolicies["/camera"];

    expect(policy.startTimeNs).toBe(80n);
    expect(isUnboundedLatestPolicy(policy)).toBe(false);

    const window = selectSynchronizedWindow({
      activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
      candidatesByTopic: new Map([
        ["/camera", [createDecodedMessage("/camera", 70n)]],
      ]),
      streamPolicies: bounds.streamPolicies,
      timeNs: bounds.timeNs,
      topics: ["/camera"],
    });

    expect(window.messagesByTopic["/camera"]).toHaveLength(0);
  });

  it("still rejects toleranceAfterNs for latest policies", () => {
    expect(() =>
      createWindowBounds({
        timeNs: 100n,
        streamPolicies: {
          "/camera": {
            mode: PlaybackSyncMode.LATEST,
            toleranceAfterNs: 20n,
          },
        },
        topics: ["/camera"],
      }),
    ).toThrow(
      "MCAP sync policy toleranceAfterNs for /camera is not valid for LATEST",
    );
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
        }),
      ).toThrow(
        "MCAP sync policy for /camera must request a positive integer frame limit",
      );
    }
  });
});

function createDecodedMessage(
  topic: string,
  timelineTimeNs: bigint,
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

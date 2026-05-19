import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ByteSourceDescriptor } from "../../../client/resources";
import { PlaybackSyncMode } from "../../../schemas/v1";
import { MCAP_ACTIVE_TIMELINE, type McapResourceClient } from "../types";
import { useMcapPlayback } from "./playback-poc";

const SOURCE: ByteSourceDescriptor = {
  sourceId: "sample.mcap",
  url: "memory://sample.mcap",
};
const TOPICS = ["/camera/front", "/lidar/top"] as const;
const STREAM_POLICIES = {
  "/camera/front": {
    mode: PlaybackSyncMode.LATEST,
    toleranceBeforeNs: 100n,
  },
  "/lidar/top": {
    mode: PlaybackSyncMode.NEAREST,
    toleranceAfterNs: 200n,
    toleranceBeforeNs: 200n,
  },
};

describe("useMcapPlayback", () => {
  it("passes caller-owned topics and stream policies to frame reads", async () => {
    const client = createPlaybackClient();

    render(<PlaybackHarness client={client} />);

    await waitFor(() => {
      expect(client.readSynchronizedMessages).toHaveBeenCalledWith(
        expect.objectContaining({
          activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
          source: SOURCE,
          streamPolicies: STREAM_POLICIES,
          timeNs: 10n,
          topics: TOPICS,
        })
      );
    });
  });
});

function PlaybackHarness({ client }: { readonly client: McapResourceClient }) {
  useMcapPlayback({
    client,
    source: SOURCE,
    streamPolicies: STREAM_POLICIES,
    timelineTickRateHz: 1,
    topics: TOPICS,
  });

  return null;
}

function createPlaybackClient(): McapResourceClient {
  return {
    dispose: vi.fn(),
    readDecodedMessages: vi.fn(async function* () {
      for (const item of [] as never[]) {
        yield item;
      }
    }),
    readSynchronizedMessageBatch: vi.fn(async () => []),
    readSynchronizedMessages: vi.fn(async ({ activeTimeline, timeNs }) => ({
      activeTimeline: activeTimeline ?? MCAP_ACTIVE_TIMELINE.LOG,
      endTimeNs: timeNs,
      messages: [],
      messagesByTopic: {},
      startTimeNs: timeNs,
      streamPolicies: {},
      timeNs,
    })),
    readTimelineRange: vi.fn(async ({ activeTimeline }) => ({
      activeTimeline: activeTimeline ?? MCAP_ACTIVE_TIMELINE.LOG,
      endTimeNs: 10n,
      startTimeNs: 10n,
    })),
    readTopics: vi.fn(async () => []),
  };
}

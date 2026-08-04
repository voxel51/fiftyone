import { describe, expect, it } from "vitest";

import {
  mcapForegroundSupersession,
  shouldMcapRequestSupersede,
} from "./playback-worker-supersession";
import { MCAP_PLAYBACK_WORKER_PRIORITY } from "./playback-worker-types";

describe("MCAP foreground supersession", () => {
  it("keys current presentation work per source, generation, and topic", () => {
    const supersession = mcapForegroundSupersession({
      generation: 3,
      payload: {
        source: createSource(),
        timeNs: 10n,
        topics: ["/lidar", "/radar", "/lidar"],
      },
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
      sourceKey: "source",
      type: "readSynchronizedMessages",
    });

    expect(supersession).toEqual({
      keys: [
        ["source", 3, "/lidar"].join("\0"),
        ["source", 3, "/radar"].join("\0"),
      ],
      target: {
        domain: ["source", 3, "current-frame"].join("\0"),
        value: "10",
      },
    });
  });

  it("does not supersede playback runway work", () => {
    expect(
      mcapForegroundSupersession({
        generation: 3,
        payload: {
          source: createSource(),
          timeNs: [10n],
          topics: ["/lidar"],
        },
        priority: MCAP_PLAYBACK_WORKER_PRIORITY.PLAYBACK_BATCH,
        sourceKey: "source",
        type: "readSynchronizedMessageBatch",
      }),
    ).toEqual({ keys: [] });
  });

  it("supersedes stale channel projections without starving another view", () => {
    const supersession = (activeColorBy: string) =>
      mcapForegroundSupersession({
        generation: 3,
        payload: {
          activeColorBy,
          capacity: 1_024,
          samplePlanKey: "4:4",
          sampledPointCount: 4,
          source: createSource(),
          sourceIndices: new Uint32Array([0, 1, 2, 3]),
          timeNs: 10n,
          topic: "/lidar",
        },
        priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
        sourceKey: "source",
        type: "readPointCloudChannel",
      });

    expect(
      shouldMcapRequestSupersede(
        supersession("intensity"),
        supersession("intensity"),
      ),
    ).toBe(true);
    expect(
      shouldMcapRequestSupersede(
        supersession("intensity"),
        supersession("ring"),
      ),
    ).toBe(false);
  });

  it("supersedes partially overlapping stream requests", () => {
    expect(
      shouldMcapRequestSupersede(
        {
          keys: [
            ["source", 1, "/lidar"].join("\0"),
            ["source", 1, "/radar"].join("\0"),
          ],
        },
        { keys: [["source", 1, "/radar"].join("\0")] },
      ),
    ).toBe(true);
    expect(
      shouldMcapRequestSupersede(
        { keys: [["source", 1, "/lidar"].join("\0")] },
        { keys: [["source", 2, "/lidar"].join("\0")] },
      ),
    ).toBe(false);
  });

  it("keeps split stream groups for one target and supersedes all groups for an older target", () => {
    const currentFrame = (timeNs: bigint, topic: string, generation = 3) =>
      mcapForegroundSupersession({
        generation,
        payload: {
          source: createSource(),
          timeNs,
          topics: [topic],
        },
        priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
        sourceKey: "source",
        type: "readSynchronizedMessages",
      });

    expect(
      shouldMcapRequestSupersede(
        currentFrame(10n, "/camera"),
        currentFrame(10n, "/lidar"),
      ),
    ).toBe(false);
    expect(
      shouldMcapRequestSupersede(
        currentFrame(10n, "/lidar"),
        currentFrame(11n, "/camera"),
      ),
    ).toBe(true);
    expect(
      shouldMcapRequestSupersede(
        currentFrame(10n, "/lidar"),
        currentFrame(11n, "/camera", 4),
      ),
    ).toBe(false);
  });
});

function createSource() {
  return {
    sizeBytes: "1024",
    sourceId: "source",
    url: "https://example.com/recording.mcap",
  };
}

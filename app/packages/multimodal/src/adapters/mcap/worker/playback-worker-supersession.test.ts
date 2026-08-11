import { describe, expect, it } from "vitest";

import {
  haveMcapSupersessionKeyOverlap,
  mcapForegroundSupersessionKeys,
} from "./playback-worker-supersession";
import { MCAP_PLAYBACK_WORKER_PRIORITY } from "./playback-worker-types";

describe("MCAP foreground supersession", () => {
  it("keys current presentation work per source, generation, and topic", () => {
    const keys = mcapForegroundSupersessionKeys({
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

    expect(keys).toEqual([
      ["source", 3, "/lidar"].join("\0"),
      ["source", 3, "/radar"].join("\0"),
    ]);
  });

  it("does not supersede playback runway work", () => {
    expect(
      mcapForegroundSupersessionKeys({
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
    ).toEqual([]);
  });

  it("supersedes stale channel projections without starving another view", () => {
    const keys = (activeColorBy: string) =>
      mcapForegroundSupersessionKeys({
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
      haveMcapSupersessionKeyOverlap(keys("intensity"), keys("intensity")),
    ).toBe(true);
    expect(
      haveMcapSupersessionKeyOverlap(keys("intensity"), keys("ring")),
    ).toBe(false);
  });

  it("detects partially overlapping stream requests", () => {
    expect(
      haveMcapSupersessionKeyOverlap(
        [
          ["source", 1, "/lidar"].join("\0"),
          ["source", 1, "/radar"].join("\0"),
        ],
        [["source", 1, "/radar"].join("\0")],
      ),
    ).toBe(true);
    expect(
      haveMcapSupersessionKeyOverlap(
        [["source", 1, "/lidar"].join("\0")],
        [["source", 2, "/lidar"].join("\0")],
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

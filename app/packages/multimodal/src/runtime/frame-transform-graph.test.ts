import { describe, expect, it } from "vitest";
import {
  dynamicChildFrameIdsForPlacement,
  EMPTY_EPISODE_FRAME_GRAPH_SUMMARY,
  summarizeEpisodeFrameGraph,
} from "./frame-transform-graph";

describe("frame transform graph policy", () => {
  it("returns the stable empty summary singleton", () => {
    expect(summarizeEpisodeFrameGraph([], new Set())).toBe(
      EMPTY_EPISODE_FRAME_GRAPH_SUMMARY,
    );
  });

  it("summarizes roots, components, and directed reachability", () => {
    const summary = summarizeEpisodeFrameGraph(
      [
        { childFrameId: "camera", dynamic: false, parentFrameId: "base" },
        { childFrameId: "base", dynamic: true, parentFrameId: "map" },
        { childFrameId: "radar", dynamic: false, parentFrameId: "world" },
      ],
      new Set(["camera", "radar"]),
    );

    expect(summary).toEqual({
      components: [
        ["base", "camera", "map"],
        ["radar", "world"],
      ],
      dataBearingReachableCountsByFrameId: new Map([
        ["base", 1],
        ["camera", 1],
        ["map", 1],
        ["radar", 1],
        ["world", 1],
      ]),
      reachableCountsByFrameId: new Map([
        ["base", 2],
        ["camera", 1],
        ["map", 3],
        ["radar", 1],
        ["world", 2],
      ]),
      roots: ["map", "world"],
      tfConnectedFrameIds: ["base", "camera", "map", "radar", "world"],
    });
  });

  it("preserves dynamic precedence when a path uses a static edge", () => {
    expect(
      dynamicChildFrameIdsForPlacement({
        dynamicChildFrameIds: new Set(["lidar"]),
        edges: [
          { childFrameId: "lidar", dynamic: false, parentFrameId: "map" },
          { childFrameId: "lidar", dynamic: true, parentFrameId: "odom" },
        ],
        frameIds: ["lidar"],
        targetFrameId: "map",
      }),
    ).toEqual(["lidar"]);
  });
});

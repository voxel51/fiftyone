import { beforeEach, describe, expect, it } from "vitest";
import {
  mcapMapPerformanceStats,
  noteMcapMapFollowCommand,
  noteMcapMapPlaybackPaint,
  noteMcapMapReactCommit,
  noteMcapMapSourceUpdate,
  resetMcapMapPerformanceStatsForTests,
} from "./mcap-map-performance";

describe("mcap map performance stats", () => {
  beforeEach(() => resetMcapMapPerformanceStatsForTests());

  it("bounds source-id retention and keeps recently updated sources", () => {
    for (let index = 0; index < 80; index += 1) {
      noteMcapMapSourceUpdate(`source-${index}`);
    }
    noteMcapMapSourceUpdate("source-16");

    const sourceUpdates = mcapMapPerformanceStats().sourceUpdates;
    expect(Object.keys(sourceUpdates)).toHaveLength(64);
    expect(sourceUpdates["source-0"]).toBeUndefined();
    expect(sourceUpdates["source-16"]).toBe(2);
    expect(mcapMapPerformanceStats().totalSourceUpdates).toBe(81);
  });

  it("reports and resets all map counters", () => {
    noteMcapMapFollowCommand();
    noteMcapMapPlaybackPaint();
    noteMcapMapReactCommit("tile");
    noteMcapMapReactCommit("surface");
    noteMcapMapSourceUpdate("route");

    expect(mcapMapPerformanceStats()).toEqual({
      followCommands: 1,
      playbackPaints: 1,
      reactCommits: { surface: 1, tile: 1 },
      sourceUpdates: { route: 1 },
      totalSourceUpdates: 1,
    });

    resetMcapMapPerformanceStatsForTests();

    expect(mcapMapPerformanceStats()).toEqual({
      followCommands: 0,
      playbackPaints: 0,
      reactCommits: { surface: 0, tile: 0 },
      sourceUpdates: {},
      totalSourceUpdates: 0,
    });
  });
});

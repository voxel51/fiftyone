import { beforeEach, describe, expect, it } from "vitest";
import {
  mapPerformanceStats,
  noteMapFollowCommand,
  noteMapPlaybackPaint,
  noteMapReactCommit,
  noteMapSourceUpdate,
  resetMapPerformanceStatsForTests,
} from "./performance";

describe("mcap map performance stats", () => {
  beforeEach(() => resetMapPerformanceStatsForTests());

  it("bounds source-id retention and keeps recently updated sources", () => {
    for (let index = 0; index < 80; index += 1) {
      noteMapSourceUpdate(`source-${index}`);
    }
    noteMapSourceUpdate("source-16");

    const sourceUpdates = mapPerformanceStats().sourceUpdates;
    expect(Object.keys(sourceUpdates)).toHaveLength(64);
    expect(sourceUpdates["source-0"]).toBeUndefined();
    expect(sourceUpdates["source-16"]).toBe(2);
    expect(mapPerformanceStats().totalSourceUpdates).toBe(81);
  });

  it("reports and resets all map counters", () => {
    noteMapFollowCommand();
    noteMapPlaybackPaint();
    noteMapReactCommit("tile");
    noteMapReactCommit("surface");
    noteMapSourceUpdate("route");

    expect(mapPerformanceStats()).toEqual({
      followCommands: 1,
      playbackPaints: 1,
      reactCommits: { surface: 1, tile: 1 },
      sourceUpdates: { route: 1 },
      totalSourceUpdates: 1,
    });

    resetMapPerformanceStatsForTests();

    expect(mapPerformanceStats()).toEqual({
      followCommands: 0,
      playbackPaints: 0,
      reactCommits: { surface: 0, tile: 0 },
      sourceUpdates: {},
      totalSourceUpdates: 0,
    });
  });
});

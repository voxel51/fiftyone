import { beforeEach, describe, expect, it } from "vitest";
import {
  episodeMapPerformanceStats,
  noteEpisodeMapFollowCommand,
  noteEpisodeMapPlaybackPaint,
  noteEpisodeMapReactCommit,
  noteEpisodeMapSourceUpdate,
  resetEpisodeMapPerformanceStatsForTests,
} from "./performance";

describe("mcap map performance stats", () => {
  beforeEach(() => resetEpisodeMapPerformanceStatsForTests());

  it("bounds source-id retention and keeps recently updated sources", () => {
    for (let index = 0; index < 80; index += 1) {
      noteEpisodeMapSourceUpdate(`source-${index}`);
    }
    noteEpisodeMapSourceUpdate("source-16");

    const sourceUpdates = episodeMapPerformanceStats().sourceUpdates;
    expect(Object.keys(sourceUpdates)).toHaveLength(64);
    expect(sourceUpdates["source-0"]).toBeUndefined();
    expect(sourceUpdates["source-16"]).toBe(2);
    expect(episodeMapPerformanceStats().totalSourceUpdates).toBe(81);
  });

  it("reports and resets all map counters", () => {
    noteEpisodeMapFollowCommand();
    noteEpisodeMapPlaybackPaint();
    noteEpisodeMapReactCommit("tile");
    noteEpisodeMapReactCommit("surface");
    noteEpisodeMapSourceUpdate("route");

    expect(episodeMapPerformanceStats()).toEqual({
      followCommands: 1,
      playbackPaints: 1,
      reactCommits: { surface: 1, tile: 1 },
      sourceUpdates: { route: 1 },
      totalSourceUpdates: 1,
    });

    resetEpisodeMapPerformanceStatsForTests();

    expect(episodeMapPerformanceStats()).toEqual({
      followCommands: 0,
      playbackPaints: 0,
      reactCommits: { surface: 0, tile: 0 },
      sourceUpdates: {},
      totalSourceUpdates: 0,
    });
  });
});

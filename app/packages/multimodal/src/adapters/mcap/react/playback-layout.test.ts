import { describe, expect, it } from "vitest";
import type { SceneSource } from "../../../scene-inventory";
import {
  rankImageSources,
  resolvePlaybackLayout,
  type PlaybackDeviceCapabilities,
} from "./playback-layout";

const STRONG_LOCAL: PlaybackDeviceCapabilities = {
  cpuCores: 16,
  memoryGb: 32,
  networkDownlinkMbps: null,
  viewportWidth: 2560,
  viewportHeight: 1440,
};

function imageSource(id: string, recordCount?: number): SceneSource {
  return {
    id,
    label: id.replace(/^\//, ""),
    type: "image",
    ...(recordCount !== undefined ? { recordCount } : {}),
  };
}

const POINT_CLOUD: SceneSource = {
  id: "/points",
  label: "points",
  type: "point-cloud",
};

describe("rankImageSources", () => {
  it("prefers dense streams and keeps unknown counts last in stable order", () => {
    const ranked = rankImageSources([
      imageSource("/cam/image_initial", 1),
      imageSource("/cam/image_rgb", 240),
      POINT_CLOUD,
      imageSource("/cam/no_stats"),
      imageSource("/cam2/image_rgb", 240),
      imageSource("/cam/no_stats_2"),
    ]);

    expect(ranked.map((s) => s.id)).toEqual([
      "/cam/image_rgb",
      "/cam2/image_rgb",
      "/cam/image_initial",
      "/cam/no_stats",
      "/cam/no_stats_2",
    ]);
  });

  it("prefers color over depth-like streams at equal density", () => {
    const ranked = rankImageSources([
      imageSource("/cam/depth", 240),
      imageSource("/cam/image_rgb", 240),
      imageSource("/cam/disparity", 500),
    ]);

    // Density still dominates; the color preference only breaks ties.
    expect(ranked.map((s) => s.id)).toEqual([
      "/cam/disparity",
      "/cam/image_rgb",
      "/cam/depth",
    ]);
  });
});

describe("resolvePlaybackLayout", () => {
  it("opens one tile per dense image source plus one 3d tile", () => {
    const { tiles, layout } = resolvePlaybackLayout({
      capabilities: STRONG_LOCAL,
      readProfile: "local",
      sources: [
        imageSource("/a", 100),
        imageSource("/b", 200),
        imageSource("/c", 50),
        POINT_CLOUD,
      ],
    });

    expect(tiles.map((tile) => tile.id)).toEqual([
      "image-1",
      "image-2",
      "image-3",
      "3d-1",
    ]);
    // Densest source binds the first tile; titles carry source labels.
    expect(tiles[0]).toMatchObject({ initialSourceId: "/b", title: "b" });
    expect(tiles[3]).toMatchObject({ tileType: "3d", title: "3D" });

    // Deliberate arrangement: image grid beside a full-height 3D column.
    expect(layout).toMatchObject({
      direction: "row",
      second: "3d-1",
      splitPercentage: 62,
    });
  });

  it("caps image tiles by cpu budget on weak machines", () => {
    const { tiles } = resolvePlaybackLayout({
      capabilities: { ...STRONG_LOCAL, cpuCores: 2 },
      readProfile: "local",
      sources: [
        imageSource("/a", 1),
        imageSource("/b", 2),
        imageSource("/c", 3),
        imageSource("/d", 4),
      ],
    });

    expect(tiles.filter((t) => t.tileType === "image")).toHaveLength(2);
  });

  it("caps image tiles by memory when the browser reports it", () => {
    const { tiles } = resolvePlaybackLayout({
      capabilities: { ...STRONG_LOCAL, memoryGb: 2 },
      readProfile: "local",
      sources: Array.from({ length: 6 }, (_, i) =>
        imageSource(`/cam-${i}`, 100)
      ),
    });

    expect(tiles.filter((t) => t.tileType === "image")).toHaveLength(2);
  });

  it("tightens the budget for remote sources by downlink", () => {
    const sources = Array.from({ length: 6 }, (_, i) =>
      imageSource(`/cam-${i}`, 100)
    );

    const slow = resolvePlaybackLayout({
      capabilities: { ...STRONG_LOCAL, networkDownlinkMbps: 10 },
      readProfile: "remote",
      sources,
    });
    const fast = resolvePlaybackLayout({
      capabilities: { ...STRONG_LOCAL, networkDownlinkMbps: 200 },
      readProfile: "remote",
      sources,
    });
    const unknown = resolvePlaybackLayout({
      capabilities: STRONG_LOCAL,
      readProfile: "remote",
      sources,
    });

    expect(slow.tiles.filter((t) => t.tileType === "image")).toHaveLength(2);
    expect(fast.tiles.filter((t) => t.tileType === "image")).toHaveLength(4);
    expect(unknown.tiles.filter((t) => t.tileType === "image")).toHaveLength(3);
  });

  it("caps image tiles by what fits the viewport at a readable size", () => {
    const { tiles } = resolvePlaybackLayout({
      capabilities: {
        ...STRONG_LOCAL,
        viewportWidth: 900,
        viewportHeight: 400,
      },
      readProfile: "local",
      sources: [
        imageSource("/a", 1),
        imageSource("/b", 2),
        imageSource("/c", 3),
        POINT_CLOUD,
      ],
    });

    // 62% of 900px fits one 400px column; 400px height fits one row.
    expect(tiles.filter((t) => t.tileType === "image")).toHaveLength(1);
  });

  it("uses the shared image-region split when 3d content is present", () => {
    const { layout } = resolvePlaybackLayout({
      capabilities: STRONG_LOCAL,
      readProfile: "local",
      sources: [imageSource("/a", 1), POINT_CLOUD],
    });

    expect(layout).toMatchObject({
      direction: "row",
      splitPercentage: 62,
    });
  });

  it("uses the full width for images when no 3d source exists", () => {
    const { tiles, layout } = resolvePlaybackLayout({
      capabilities: STRONG_LOCAL,
      readProfile: "local",
      sources: [imageSource("/a", 1), imageSource("/b", 2)],
    });

    expect(tiles.map((t) => t.id)).toEqual(["image-1", "image-2"]);
    expect(layout).toMatchObject({ direction: "row" });
  });

  it("returns a lone 3d tile for point-cloud-only scenes", () => {
    const { tiles, layout } = resolvePlaybackLayout({
      capabilities: STRONG_LOCAL,
      readProfile: "local",
      sources: [POINT_CLOUD],
    });

    expect(tiles.map((t) => t.id)).toEqual(["3d-1"]);
    expect(layout).toBe("3d-1");
  });

  it("returns no tiles for scenes without renderable sources", () => {
    const { tiles, layout } = resolvePlaybackLayout({
      capabilities: STRONG_LOCAL,
      sources: [
        { id: "/annotations", label: "annotations", type: "image-annotation" },
      ],
    });

    expect(tiles).toEqual([]);
    expect(layout).toBeUndefined();
  });
});

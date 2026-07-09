import { describe, expect, it } from "vitest";
import { collectTileIds } from "@fiftyone/tiling";
import type { SceneSource } from "../../../scene-inventory";
import {
  buildMcapAutoLayout,
  orderImageSourcesForManualSelection,
  rankDefaultImageSources,
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
const THREE_D_TOP_SPLIT_PERCENTAGE = 100 * (2 / 3);

function imageSource(id: string, recordCount?: number): SceneSource {
  return {
    id,
    label: id.replace(/^\//, ""),
    type: "image",
    ...(recordCount !== undefined ? { recordCount } : {}),
  };
}

function logSource(id: string, recordCount?: number): SceneSource {
  return {
    id,
    label: id.replace(/^\//, ""),
    type: "log",
    ...(recordCount !== undefined ? { recordCount } : {}),
  };
}

function locationSource(id: string, recordCount?: number): SceneSource {
  return {
    id,
    label: id.replace(/^\//, ""),
    type: "location",
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

describe("rankDefaultImageSources", () => {
  it("suppresses raw image siblings when a preferred equivalent exists", () => {
    const ranked = rankDefaultImageSources([
      imageSource("/camera/front/image", 1_000),
      imageSource("/camera/front/image_downsampled", 100),
      imageSource("/camera/back/image", 900),
    ]);

    expect(ranked.map((s) => s.id)).toEqual([
      "/camera/front/image_downsampled",
      "/camera/back/image",
    ]);
  });
});

describe("orderImageSourcesForManualSelection", () => {
  it("keeps raw image siblings visible after their preferred equivalent", () => {
    const ordered = orderImageSourcesForManualSelection([
      imageSource("/camera/front/image", 1_000),
      imageSource("/camera/back/image", 900),
      imageSource("/camera/front/image_downsampled", 100),
    ]);

    expect(ordered.map((s) => s.id)).toEqual([
      "/camera/front/image_downsampled",
      "/camera/front/image",
      "/camera/back/image",
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

    // Deliberate arrangement: 3D spans the top, images sit below.
    expect(layout).toMatchObject({
      direction: "column",
      first: "3d-1",
      splitPercentage: THREE_D_TOP_SPLIT_PERCENTAGE,
    });
  });

  it("opens default tiles on preferred image equivalents only", () => {
    const { tiles } = resolvePlaybackLayout({
      capabilities: STRONG_LOCAL,
      readProfile: "local",
      sources: [
        imageSource("/camera/front/image", 1_000),
        imageSource("/camera/front/image_downsampled", 100),
        imageSource("/camera/back/image", 900),
      ],
    });

    expect(tiles.map((tile) => tile.initialSourceId)).toEqual([
      "/camera/front/image_downsampled",
      "/camera/back/image",
    ]);
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
        imageSource(`/cam-${i}`, 100),
      ),
    });

    expect(tiles.filter((t) => t.tileType === "image")).toHaveLength(2);
  });

  it("tightens the budget for remote sources by downlink", () => {
    const sources = Array.from({ length: 6 }, (_, i) =>
      imageSource(`/cam-${i}`, 100),
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

    // The bottom shelf gets full viewport width, fitting two readable columns.
    expect(tiles.filter((t) => t.tileType === "image")).toHaveLength(2);
  });

  it("spans 3d across the top two-thirds when image content is present", () => {
    const { layout } = resolvePlaybackLayout({
      capabilities: STRONG_LOCAL,
      readProfile: "local",
      sources: [imageSource("/a", 1), POINT_CLOUD],
    });

    expect(layout).toMatchObject({
      direction: "column",
      first: "3d-1",
      second: "image-1",
      splitPercentage: THREE_D_TOP_SPLIT_PERCENTAGE,
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

  it("opens a map tile for location-only scenes", () => {
    const { tiles, layout } = resolvePlaybackLayout({
      capabilities: STRONG_LOCAL,
      readProfile: "local",
      sources: [locationSource("/gps/fix", 1_000)],
    });

    expect(tiles).toEqual([
      {
        id: "map-1",
        tileType: "map",
        title: "Map",
      },
    ]);
    expect(layout).toBe("map-1");
  });

  it("places location maps beside the 3d view", () => {
    const { tiles, layout } = resolvePlaybackLayout({
      capabilities: STRONG_LOCAL,
      readProfile: "local",
      sources: [POINT_CLOUD, locationSource("/gps/fix", 1_000)],
    });

    expect(tiles.map((tile) => tile.id)).toEqual(["3d-1", "map-1"]);
    expect(layout).toEqual({
      direction: "row",
      first: "3d-1",
      second: "map-1",
      splitPercentage: 70,
    });
  });

  it("opens a log tile for logs-only scenes", () => {
    const { tiles, layout } = resolvePlaybackLayout({
      capabilities: STRONG_LOCAL,
      readProfile: "local",
      sources: [logSource("/diagnostics", 12)],
    });

    expect(tiles).toEqual([
      {
        id: "log-1",
        tileType: "log",
        title: "Logs",
      },
    ]);
    expect(layout).toBe("log-1");
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

describe("buildMcapAutoLayout", () => {
  it("spans 3d across the top two-thirds above one image tile", () => {
    expect(buildMcapAutoLayout(["image-1", "3d-1"])).toEqual({
      direction: "column",
      first: "3d-1",
      second: "image-1",
      splitPercentage: THREE_D_TOP_SPLIT_PERCENTAGE,
    });
  });

  it("places three images below one full-width 3d tile", () => {
    const layout = buildMcapAutoLayout([
      "image-1",
      "image-2",
      "image-3",
      "3d-1",
    ]);

    expect(layout).toMatchObject({
      direction: "column",
      first: "3d-1",
      splitPercentage: THREE_D_TOP_SPLIT_PERCENTAGE,
    });
    expect(
      collectTileIds(layout).filter((id) => id.startsWith("image-")),
    ).toEqual(["image-1", "image-2", "image-3"]);
  });

  it("groups multiple 3d tiles inside the full-width top region", () => {
    expect(buildMcapAutoLayout(["image-1", "3d-1", "3d-2"])).toEqual({
      direction: "column",
      first: {
        direction: "row",
        first: "3d-1",
        second: "3d-2",
        splitPercentage: 50,
      },
      second: "image-1",
      splitPercentage: THREE_D_TOP_SPLIT_PERCENTAGE,
    });
  });

  it("places map tiles beside 3d tiles in the top visual region", () => {
    expect(buildMcapAutoLayout(["image-1", "3d-1", "map-1"])).toEqual({
      direction: "column",
      first: {
        direction: "row",
        first: "3d-1",
        second: "map-1",
        splitPercentage: 70,
      },
      second: "image-1",
      splitPercentage: THREE_D_TOP_SPLIT_PERCENTAGE,
    });
  });

  it("keeps image tiles co-located in a visual bank", () => {
    expect(buildMcapAutoLayout(["image-1", "image-2", "image-3"])).toEqual({
      direction: "row",
      first: {
        direction: "column",
        first: "image-1",
        second: "image-2",
        splitPercentage: 50,
      },
      second: "image-3",
      splitPercentage: 50,
    });
  });

  it("co-locates maps with images when no 3d tile is present", () => {
    expect(buildMcapAutoLayout(["image-1", "map-1"])).toEqual({
      direction: "row",
      first: "image-1",
      second: "map-1",
      splitPercentage: 65,
    });
  });

  it("stacks plot tiles vertically", () => {
    expect(buildMcapAutoLayout(["plot-1", "plot-2", "plot-3"])).toEqual({
      direction: "column",
      first: "plot-1",
      second: {
        direction: "column",
        first: "plot-2",
        second: "plot-3",
        splitPercentage: 50,
      },
      splitPercentage: 100 / 3,
    });
  });

  it("stacks log tiles vertically", () => {
    expect(buildMcapAutoLayout(["log-1", "log-2"])).toEqual({
      direction: "column",
      first: "log-1",
      second: "log-2",
      splitPercentage: 50,
    });
  });

  it("stacks message tiles vertically", () => {
    expect(buildMcapAutoLayout(["raw-1", "raw-2"])).toEqual({
      direction: "column",
      first: "raw-1",
      second: "raw-2",
      splitPercentage: 50,
    });
  });

  it("places 3d on top with images and plots beside a message rail below", () => {
    expect(
      buildMcapAutoLayout([
        "image-1",
        "3d-1",
        "plot-1",
        "plot-2",
        "raw-1",
        "raw-2",
      ]),
    ).toEqual({
      direction: "column",
      first: "3d-1",
      second: {
        direction: "row",
        first: {
          direction: "row",
          first: "image-1",
          second: {
            direction: "column",
            first: "plot-1",
            second: "plot-2",
            splitPercentage: 50,
          },
          splitPercentage: 65,
        },
        second: {
          direction: "column",
          first: "raw-1",
          second: "raw-2",
          splitPercentage: 50,
        },
        splitPercentage: 75,
      },
      splitPercentage: THREE_D_TOP_SPLIT_PERCENTAGE,
    });
  });

  it("uses clean single-purpose layouts for point-cloud-only and image-only workspaces", () => {
    expect(buildMcapAutoLayout(["3d-1"])).toBe("3d-1");
    expect(buildMcapAutoLayout(["image-1", "image-2"])).toEqual({
      direction: "row",
      first: "image-1",
      second: "image-2",
      splitPercentage: 50,
    });
  });

  it("keeps unknown tile ids in diagnostics after known plot tiles", () => {
    expect(buildMcapAutoLayout(["plot-1", "custom-1"])).toEqual({
      direction: "column",
      first: "plot-1",
      second: "custom-1",
      splitPercentage: 50,
    });
  });
});

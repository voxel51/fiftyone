import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isValidMosaicLayout,
  episodeTileTypeFromId,
  readEpisodeCameraPreferences,
  readEpisodeModalLayout,
  sanitizeEpisodeExtensionSettings,
  sanitizeLogSettings,
  sanitizeMapSettings,
  sanitizePlotSeries,
  sanitizeRawStreams,
  sanitizeTileTitles,
  writeEpisodeCameraPreferences,
  writeEpisodeModalLayout,
} from "./episode-layout-persistence";

const STORAGE_KEY = "fiftyone.episode.modal-layout.v2";

describe("episode-layout-persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns null when nothing is stored", () => {
    expect(readEpisodeModalLayout()).toBeNull();
  });

  it("round-trips sidebar state and layout", () => {
    writeEpisodeModalLayout({
      leftSidebarOpen: true,
      layout: {
        direction: "row",
        first: "camera-default",
        second: "lidar-default",
        splitPercentage: 60,
      },
    });
    const read = readEpisodeModalLayout();
    expect(read?.leftSidebarOpen).toBe(true);
    expect(read?.layout).toEqual({
      direction: "row",
      first: "camera-default",
      second: "lidar-default",
      splitPercentage: 60,
    });
  });

  it("merges partial writes instead of clobbering other fields", () => {
    writeEpisodeModalLayout({ leftSidebarOpen: true });
    writeEpisodeModalLayout({ layout: "camera-default" });
    const read = readEpisodeModalLayout();
    expect(read?.leftSidebarOpen).toBe(true);
    expect(read?.layout).toBe("camera-default");
  });

  it("round-trips expanded tile state separately from layout", () => {
    writeEpisodeModalLayout({
      expandedTileId: "lidar-default",
      layout: {
        direction: "row",
        first: "camera-default",
        second: "lidar-default",
      },
    });

    const read = readEpisodeModalLayout();
    expect(read?.layout).toEqual({
      direction: "row",
      first: "camera-default",
      second: "lidar-default",
    });
    expect(read?.expandedTileId).toBe("lidar-default");
  });

  it("clears expanded tile state when written as undefined", () => {
    writeEpisodeModalLayout({ expandedTileId: "image-1" }, "dataset-a");
    writeEpisodeModalLayout({ expandedTileId: undefined }, "dataset-a");

    expect(readEpisodeModalLayout("dataset-a")?.expandedTileId).toBeUndefined();
    expect(readEpisodeModalLayout()?.expandedTileId).toBeUndefined();
  });

  it("treats corrupt JSON as nothing stored", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(readEpisodeModalLayout()).toBeNull();
  });

  it("rejects payloads from other schema versions", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 99, leftSidebarOpen: true }),
    );
    expect(readEpisodeModalLayout()).toBeNull();
  });

  it("strips dataset-scoped fields from fallback reads", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        fallback: {
          cameraPreferences: {
            mcap: { preferredWorldFrameId: "map" },
          },
          leftSidebarOpen: true,
          plotSeries: {
            "plot-1": [{ color: "#3987e5", fieldPath: "x", stream: "/odom" }],
          },
          mapSettings: {
            "map-1": { enabledStreams: ["/gps"], followEgo: false },
          },
          rawStreams: { "raw-1": "/imu" },
          sceneUpAxis: "z",
          tileTitles: { "image-1": "Front Camera" },
        },
      }),
    );

    expect(readEpisodeModalLayout()).toEqual({ leftSidebarOpen: true });
  });

  it("drops structurally invalid layouts but keeps valid fields", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        fallback: {
          leftSidebarOpen: true,
          layout: { direction: "diagonal", first: "a", second: "b" },
        },
      }),
    );
    const read = readEpisodeModalLayout();
    expect(read?.leftSidebarOpen).toBe(true);
    expect(read?.layout).toBeUndefined();
  });

  it("drops invalid expanded tile ids but keeps valid fields", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        fallback: { expandedTileId: "", leftSidebarOpen: true },
      }),
    );
    const read = readEpisodeModalLayout();
    expect(read?.expandedTileId).toBeUndefined();
    expect(read?.leftSidebarOpen).toBe(true);
  });

  describe("per-dataset keying", () => {
    it("keeps separate arrangements per dataset", () => {
      writeEpisodeModalLayout({ layout: "image-1" }, "dataset-a");
      writeEpisodeModalLayout({ layout: "3d-1" }, "dataset-b");
      expect(readEpisodeModalLayout("dataset-a")?.layout).toBe("image-1");
      expect(readEpisodeModalLayout("dataset-b")?.layout).toBe("3d-1");
    });

    it("does not restore another dataset's arrangement for a never-seen dataset", () => {
      writeEpisodeModalLayout({ layout: "image-1" }, "dataset-a");
      writeEpisodeModalLayout({ layout: "3d-1" }, "dataset-b");
      expect(readEpisodeModalLayout("dataset-never-seen")).toBeNull();
      expect(readEpisodeModalLayout()).toBeNull();
    });

    it("does not fill missing fields from another dataset", () => {
      writeEpisodeModalLayout({ leftSidebarOpen: false }, "dataset-a");
      writeEpisodeModalLayout({ layout: "image-1" }, "dataset-b");
      const read = readEpisodeModalLayout("dataset-a");
      expect(read?.leftSidebarOpen).toBe(false);
      expect(read?.layout).toBeUndefined();
    });
  });

  describe("camera preferences", () => {
    it("isolates conventions by dataset and selected media field", () => {
      writeEpisodeCameraPreferences(
        { defaultTrackingMode: "free", preferredWorldFrameId: "map" },
        "dataset-a",
        "mcap",
      );
      writeEpisodeCameraPreferences(
        { defaultTrackingMode: "pose" },
        "dataset-a",
        "alternate_mcap",
      );
      writeEpisodeCameraPreferences(
        { defaultTrackingMode: "heading" },
        "dataset-b",
        "mcap",
      );

      expect(readEpisodeCameraPreferences("dataset-a", "mcap")).toEqual({
        defaultTrackingMode: "free",
        preferredWorldFrameId: "map",
      });
      expect(
        readEpisodeCameraPreferences("dataset-a", "alternate_mcap"),
      ).toEqual({
        defaultTrackingMode: "pose",
      });
      expect(readEpisodeCameraPreferences("dataset-b", "mcap")).toEqual({
        defaultTrackingMode: "heading",
      });
    });

    it("merges partial convention writes without erasing siblings", () => {
      writeEpisodeCameraPreferences(
        { preferredWorldFrameId: "map" },
        "dataset-a",
        "mcap",
      );
      writeEpisodeCameraPreferences(
        { preferredCameraTargetFrameId: "base_link" },
        "dataset-a",
        "mcap",
      );

      expect(readEpisodeCameraPreferences("dataset-a", "mcap")).toEqual({
        preferredCameraTargetFrameId: "base_link",
        preferredWorldFrameId: "map",
      });
    });

    it("sanitizes invalid modes and oversized frame ids", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: 2,
          byDataset: {
            "dataset-a": {
              cameraPreferences: {
                mcap: {
                  defaultTrackingMode: "orbit",
                  preferredCameraTargetFrameId: "x".repeat(513),
                  preferredWorldFrameId: "  map  ",
                  sceneUpAxis: "z",
                },
              },
              updatedAtMs: 1,
            },
          },
        }),
      );

      expect(readEpisodeCameraPreferences("dataset-a", "mcap")).toEqual({
        preferredWorldFrameId: "map",
        sceneUpAxis: "z",
      });
    });

    it("keeps the newest field when the preference table reaches its limit", () => {
      for (let index = 0; index < 17; index += 1) {
        writeEpisodeCameraPreferences(
          { preferredWorldFrameId: `map-${index}` },
          "dataset-a",
          `episode-${index}`,
        );
      }

      expect(readEpisodeCameraPreferences("dataset-a", "episode-0")).toBeNull();
      expect(readEpisodeCameraPreferences("dataset-a", "episode-16")).toEqual({
        preferredWorldFrameId: "map-16",
      });
    });
  });

  describe("sidebarWidthPx", () => {
    it("round-trips through a dataset entry", () => {
      writeEpisodeModalLayout({ sidebarWidthPx: 420 }, "dataset-a");
      expect(readEpisodeModalLayout("dataset-a")?.sidebarWidthPx).toBe(420);
    });

    it("drops non-numeric or non-positive widths but keeps valid fields", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: 2, fallback: { sidebarWidthPx: "wide" } }),
      );
      expect(readEpisodeModalLayout()?.sidebarWidthPx).toBeUndefined();
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: 2,
          fallback: { sidebarWidthPx: -5, leftSidebarOpen: true },
        }),
      );
      const read = readEpisodeModalLayout();
      expect(read?.sidebarWidthPx).toBeUndefined();
      expect(read?.leftSidebarOpen).toBe(true);
    });
  });

  describe("eviction", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("caps the table at 20 datasets, evicting the least recently updated", () => {
      for (let i = 0; i < 20; i++) {
        vi.setSystemTime(1_000 + i);
        writeEpisodeModalLayout({ layout: `image-${i}` }, `dataset-${i}`);
      }
      // Touch the oldest entry so it stops being the eviction candidate.
      vi.setSystemTime(5_000);
      writeEpisodeModalLayout({ leftSidebarOpen: true }, "dataset-0");
      // A 21st dataset evicts dataset-1 (now the least recently updated).
      vi.setSystemTime(5_001);
      writeEpisodeModalLayout({ layout: "image-20" }, "dataset-20");

      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      const keys = Object.keys(raw.byDataset);
      expect(keys).toHaveLength(20);
      expect(keys).not.toContain("dataset-1");
      expect(keys).toContain("dataset-0");
      expect(keys).toContain("dataset-20");
      // The evicted dataset starts from defaults from now on.
      expect(readEpisodeModalLayout("dataset-1")).toBeNull();
    });
  });

  describe("isValidMosaicLayout", () => {
    it("accepts a bare tile id", () => {
      expect(isValidMosaicLayout("camera-default")).toBe(true);
    });

    it("accepts nested row/column splits", () => {
      expect(
        isValidMosaicLayout({
          direction: "column",
          first: { direction: "row", first: "a-1", second: "b-2" },
          second: "c-3",
        }),
      ).toBe(true);
    });

    it("rejects empty ids, bad directions, and missing branches", () => {
      expect(isValidMosaicLayout("")).toBe(false);
      expect(isValidMosaicLayout(null)).toBe(false);
      expect(isValidMosaicLayout(42)).toBe(false);
      expect(isValidMosaicLayout({ direction: "row", first: "a-1" })).toBe(
        false,
      );
      expect(
        isValidMosaicLayout({
          direction: "row",
          first: "a-1",
          second: "b-2",
          splitPercentage: "60",
        }),
      ).toBe(false);
      expect(
        isValidMosaicLayout({
          direction: "row",
          first: "a-1",
          second: "b-2",
          splitPercentage: -1,
        }),
      ).toBe(false);
      expect(
        isValidMosaicLayout({
          direction: "row",
          first: "a-1",
          second: "b-2",
          splitPercentage: 101,
        }),
      ).toBe(false);
    });
  });

  describe("episodeTileTypeFromId", () => {
    it("strips the trailing suffix", () => {
      expect(episodeTileTypeFromId("camera-default")).toBe("camera");
      expect(episodeTileTypeFromId("lidar-12")).toBe("lidar");
      expect(episodeTileTypeFromId("image-annotation-3")).toBe(
        "image-annotation",
      );
    });

    it("returns null for ids without a suffix", () => {
      expect(episodeTileTypeFromId("camera")).toBeNull();
      expect(episodeTileTypeFromId("-3")).toBeNull();
      expect(episodeTileTypeFromId("camera-")).toBeNull();
    });
  });

  describe("extensionSettings", () => {
    it("keeps bounded JSON for namespaced extension tiles only", () => {
      expect(
        sanitizeEpisodeExtensionSettings({
          "fiftyone:events-1": {
            ["x".repeat(257)]: "ignored",
            nested: { enabled: true },
            invalid: 1n,
            mode: "compact",
          },
          "image-1": { ignored: true },
          "missing-suffix": { ignored: true },
        }),
      ).toEqual({
        "fiftyone:events-1": {
          nested: { enabled: true },
          mode: "compact",
        },
      });
    });
  });

  describe("plotSeries", () => {
    const SERIES = [
      { color: "#3987e5", fieldPath: "twist.linear.x", stream: "/odom" },
    ];

    it("round-trips per-dataset plot series", () => {
      writeEpisodeModalLayout({ plotSeries: { "plot-1": SERIES } }, "ds-a");
      expect(readEpisodeModalLayout("ds-a")?.plotSeries).toEqual({
        "plot-1": SERIES,
      });
    });

    it("never leaks plot config to another dataset", () => {
      writeEpisodeModalLayout({ leftSidebarOpen: true }, "ds-b");
      writeEpisodeModalLayout(
        { layout: "plot-1", plotSeries: { "plot-1": SERIES } },
        "ds-a",
      );

      expect(readEpisodeModalLayout("ds-b")).toEqual({ leftSidebarOpen: true });
      expect(readEpisodeModalLayout("ds-b")?.plotSeries).toBeUndefined();
    });

    it("sanitizes malformed plot series rows individually", () => {
      writeEpisodeModalLayout(
        {
          plotSeries: {
            "plot-1": [
              ...SERIES,
              { color: "not-a-color", fieldPath: "x", stream: "/t" },
              { color: "#ffffff", fieldPath: "", stream: "/t" },
              "garbage",
            ] as never,
            "image-1": SERIES,
            "no-suffix": SERIES,
          } as never,
        },
        "ds-a",
      );
      expect(readEpisodeModalLayout("ds-a")?.plotSeries).toEqual({
        "plot-1": SERIES,
      });
    });

    it("sanitizePlotSeries rejects non-object payloads", () => {
      expect(sanitizePlotSeries(null)).toBeUndefined();
      expect(sanitizePlotSeries([])).toBeUndefined();
      expect(sanitizePlotSeries("x")).toBeUndefined();
      expect(sanitizePlotSeries({ "plot-1": [] })).toBeUndefined();
    });
  });

  describe("rawStreams", () => {
    it("round-trips per-dataset raw tile streams", () => {
      writeEpisodeModalLayout({ rawStreams: { "raw-1": "/imu" } }, "ds-a");
      expect(readEpisodeModalLayout("ds-a")?.rawStreams).toEqual({
        "raw-1": "/imu",
      });
    });

    it("never leaks raw stream config to another dataset", () => {
      writeEpisodeModalLayout({ leftSidebarOpen: true }, "ds-b");
      writeEpisodeModalLayout(
        { layout: "raw-1", rawStreams: { "raw-1": "/imu" } },
        "ds-a",
      );

      expect(readEpisodeModalLayout("ds-b")).toEqual({ leftSidebarOpen: true });
      expect(readEpisodeModalLayout("ds-b")?.rawStreams).toBeUndefined();
    });

    it("drops rows with non-raw tile ids or invalid streams", () => {
      writeEpisodeModalLayout(
        {
          rawStreams: {
            "raw-1": "/imu",
            "plot-1": "/odom",
            "no-suffix": "/x",
            "raw-2": "",
            "raw-3": 7,
          } as never,
        },
        "ds-a",
      );
      expect(readEpisodeModalLayout("ds-a")?.rawStreams).toEqual({
        "raw-1": "/imu",
      });
    });

    it("sanitizeRawStreams rejects non-object payloads", () => {
      expect(sanitizeRawStreams(null)).toBeUndefined();
      expect(sanitizeRawStreams([])).toBeUndefined();
      expect(sanitizeRawStreams("x")).toBeUndefined();
      expect(sanitizeRawStreams({})).toBeUndefined();
    });
  });

  describe("logSettings", () => {
    const SETTINGS = {
      "log-1": {
        enabledStreams: ["/rosout"],
        followPlayhead: false,
        // Canonical severity order, as the sanitizer normalizes it.
        selectedLevels: ["warn", "error"],
      },
    };

    it("round-trips per-dataset log tile settings", () => {
      writeEpisodeModalLayout({ logSettings: SETTINGS as never }, "ds-a");
      expect(readEpisodeModalLayout("ds-a")?.logSettings).toEqual(SETTINGS);
    });

    it("sanitizes malformed log settings rows individually", () => {
      writeEpisodeModalLayout(
        {
          logSettings: {
            "log-1": {
              enabledStreams: ["/rosout", "", "/rosout", 5],
              followPlayhead: false,
              selectedLevels: ["error", "shout"],
            },
            "image-1": {
              followPlayhead: true,
              selectedLevels: ["info"],
            },
            "log-2": {
              followPlayhead: "yes",
              selectedLevels: [],
            },
          } as never,
        },
        "ds-a",
      );

      expect(readEpisodeModalLayout("ds-a")?.logSettings).toEqual({
        "log-1": {
          enabledStreams: ["/rosout"],
          followPlayhead: false,
          selectedLevels: ["error"],
        },
        // Non-boolean follow falls back to the default; an explicitly
        // empty level selection survives — all-off is a deliberate view.
        "log-2": {
          followPlayhead: true,
          selectedLevels: [],
        },
      });
    });

    it("sanitizeLogSettings rejects non-object payloads", () => {
      expect(sanitizeLogSettings(null)).toBeUndefined();
      expect(sanitizeLogSettings([])).toBeUndefined();
    });
  });

  describe("mapSettings", () => {
    const SETTINGS = {
      "map-1": {
        baseLayer: "none" as const,
        enabledStreams: ["/gps/front", "/gps/rear"],
        followEgo: false,
      },
    };

    it("round-trips per-dataset map tile settings", () => {
      writeEpisodeModalLayout({ mapSettings: SETTINGS }, "ds-a");
      expect(readEpisodeModalLayout("ds-a")?.mapSettings).toEqual(SETTINGS);
    });

    it("never leaks map settings to another dataset", () => {
      writeEpisodeModalLayout({ leftSidebarOpen: true }, "ds-b");
      writeEpisodeModalLayout(
        { layout: "map-1", mapSettings: SETTINGS },
        "ds-a",
      );

      expect(readEpisodeModalLayout("ds-b")).toEqual({ leftSidebarOpen: true });
      expect(readEpisodeModalLayout("ds-b")?.mapSettings).toBeUndefined();
    });

    it("sanitizes malformed map settings rows individually", () => {
      writeEpisodeModalLayout(
        {
          mapSettings: {
            "map-1": {
              baseLayer: "none",
              enabledStreams: ["/gps", "", "/gps", 5],
              followEgo: false,
              styleUrl: "https://tiles.example.test/style.json",
            },
            "image-1": {
              enabledStreams: ["/camera"],
              followEgo: true,
            },
            "map-2": {
              baseLayer: "surprise",
              enabledStreams: [],
              followEgo: "yes",
            },
            "no-suffix": {
              enabledStreams: ["/gps"],
              followEgo: true,
            },
          } as never,
        },
        "ds-a",
      );

      expect(readEpisodeModalLayout("ds-a")?.mapSettings).toEqual({
        "map-1": {
          baseLayer: "none",
          enabledStreams: ["/gps"],
          followEgo: false,
        },
        "map-2": {
          baseLayer: "default",
          enabledStreams: [],
          followEgo: true,
        },
      });
    });

    it("sanitizeMapSettings rejects non-object payloads", () => {
      expect(sanitizeMapSettings(null)).toBeUndefined();
      expect(sanitizeMapSettings([])).toBeUndefined();
      expect(sanitizeMapSettings("x")).toBeUndefined();
      expect(sanitizeMapSettings({})).toBeUndefined();
    });
  });

  describe("tileTitles", () => {
    it("round-trips per-dataset manual tile titles", () => {
      writeEpisodeModalLayout(
        { tileTitles: { "image-1": "Front Camera" } },
        "ds-a",
      );
      expect(readEpisodeModalLayout("ds-a")?.tileTitles).toEqual({
        "image-1": "Front Camera",
      });
    });

    it("never leaks tile titles to another dataset", () => {
      writeEpisodeModalLayout({ leftSidebarOpen: true }, "ds-b");
      writeEpisodeModalLayout(
        { layout: "image-1", tileTitles: { "image-1": "Front Camera" } },
        "ds-a",
      );

      expect(readEpisodeModalLayout("ds-b")).toEqual({ leftSidebarOpen: true });
      expect(readEpisodeModalLayout("ds-b")?.tileTitles).toBeUndefined();
    });

    it("drops rows with invalid tile ids or titles", () => {
      writeEpisodeModalLayout(
        {
          tileTitles: {
            "image-1": "  Front Camera  ",
            nosuffix: "No suffix",
            "plot-1": "",
            "raw-1": 7,
          } as never,
        },
        "ds-a",
      );
      expect(readEpisodeModalLayout("ds-a")?.tileTitles).toEqual({
        "image-1": "Front Camera",
      });
    });

    it("sanitizeTileTitles rejects non-object payloads", () => {
      expect(sanitizeTileTitles(null)).toBeUndefined();
      expect(sanitizeTileTitles([])).toBeUndefined();
      expect(sanitizeTileTitles("x")).toBeUndefined();
      expect(sanitizeTileTitles({})).toBeUndefined();
    });
  });

  describe("sceneUpAxis", () => {
    it("round-trips per-dataset scene up-axis", () => {
      writeEpisodeModalLayout({ sceneUpAxis: "y" }, "ds-a");
      expect(readEpisodeModalLayout("ds-a")?.sceneUpAxis).toBe("y");
    });

    it("never leaks scene up-axis to another dataset", () => {
      writeEpisodeModalLayout({ leftSidebarOpen: true }, "ds-b");
      writeEpisodeModalLayout({ layout: "3d-1", sceneUpAxis: "x" }, "ds-a");

      expect(readEpisodeModalLayout("ds-b")).toEqual({ leftSidebarOpen: true });
      expect(readEpisodeModalLayout("ds-b")?.sceneUpAxis).toBeUndefined();
    });

    it("drops invalid scene up-axis values but keeps valid fields", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: 2,
          byDataset: {
            "ds-a": {
              leftSidebarOpen: true,
              sceneUpAxis: "north",
              updatedAtMs: 1,
            },
          },
        }),
      );

      const read = readEpisodeModalLayout("ds-a");
      expect(read?.leftSidebarOpen).toBe(true);
      expect(read?.sceneUpAxis).toBeUndefined();
    });
  });
});

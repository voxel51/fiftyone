import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isValidMosaicLayout,
  mcapTileTypeFromId,
  readMcapCameraPreferences,
  readMcapModalLayout,
  sanitizeLogSettings,
  sanitizeMapSettings,
  sanitizePlotSeries,
  sanitizeRawTopics,
  sanitizeTileTitles,
  writeMcapCameraPreferences,
  writeMcapModalLayout,
} from "./mcap-layout-persistence";

const STORAGE_KEY = "fiftyone.mcap.modal-layout";

describe("mcap-layout-persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns null when nothing is stored", () => {
    expect(readMcapModalLayout()).toBeNull();
  });

  it("round-trips sidebar state and layout", () => {
    writeMcapModalLayout({
      leftSidebarOpen: true,
      layout: {
        direction: "row",
        first: "camera-default",
        second: "lidar-default",
        splitPercentage: 60,
      },
    });
    const read = readMcapModalLayout();
    expect(read?.leftSidebarOpen).toBe(true);
    expect(read?.layout).toEqual({
      direction: "row",
      first: "camera-default",
      second: "lidar-default",
      splitPercentage: 60,
    });
  });

  it("merges partial writes instead of clobbering other fields", () => {
    writeMcapModalLayout({ leftSidebarOpen: true });
    writeMcapModalLayout({ layout: "camera-default" });
    const read = readMcapModalLayout();
    expect(read?.leftSidebarOpen).toBe(true);
    expect(read?.layout).toBe("camera-default");
  });

  it("round-trips expanded tile state separately from layout", () => {
    writeMcapModalLayout({
      expandedTileId: "lidar-default",
      layout: {
        direction: "row",
        first: "camera-default",
        second: "lidar-default",
      },
    });

    const read = readMcapModalLayout();
    expect(read?.layout).toEqual({
      direction: "row",
      first: "camera-default",
      second: "lidar-default",
    });
    expect(read?.expandedTileId).toBe("lidar-default");
  });

  it("clears expanded tile state when written as undefined", () => {
    writeMcapModalLayout({ expandedTileId: "image-1" }, "dataset-a");
    writeMcapModalLayout({ expandedTileId: undefined }, "dataset-a");

    expect(readMcapModalLayout("dataset-a")?.expandedTileId).toBeUndefined();
    expect(readMcapModalLayout()?.expandedTileId).toBeUndefined();
  });

  it("treats corrupt JSON as nothing stored", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(readMcapModalLayout()).toBeNull();
  });

  it("rejects payloads from other schema versions", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 99, leftSidebarOpen: true }),
    );
    expect(readMcapModalLayout()).toBeNull();
  });

  it("migrates pre-versioned fallback layouts", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        layout: "image-1",
        leftSidebarOpen: true,
        mapSettings: { "map-1": { enabledTopics: ["/gps"], followEgo: true } },
        rawTopics: { "raw-1": "/imu" },
        sceneUpAxis: "y",
        tileTitles: { "image-1": "Front Camera" },
      }),
    );

    expect(readMcapModalLayout()).toEqual({
      layout: "image-1",
      leftSidebarOpen: true,
    });
  });

  it("strips dataset-scoped fields from fallback reads", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        fallback: {
          cameraPreferences: {
            mcap: { preferredWorldFrameId: "map" },
          },
          leftSidebarOpen: true,
          plotSeries: {
            "plot-1": [{ color: "#3987e5", fieldPath: "x", topic: "/odom" }],
          },
          mapSettings: {
            "map-1": { enabledTopics: ["/gps"], followEgo: false },
          },
          rawTopics: { "raw-1": "/imu" },
          sceneUpAxis: "z",
          tileTitles: { "image-1": "Front Camera" },
        },
      }),
    );

    expect(readMcapModalLayout()).toEqual({ leftSidebarOpen: true });
  });

  it("drops structurally invalid layouts but keeps valid fields", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        fallback: {
          leftSidebarOpen: true,
          layout: { direction: "diagonal", first: "a", second: "b" },
        },
      }),
    );
    const read = readMcapModalLayout();
    expect(read?.leftSidebarOpen).toBe(true);
    expect(read?.layout).toBeUndefined();
  });

  it("drops invalid expanded tile ids but keeps valid fields", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        fallback: { expandedTileId: "", leftSidebarOpen: true },
      }),
    );
    const read = readMcapModalLayout();
    expect(read?.expandedTileId).toBeUndefined();
    expect(read?.leftSidebarOpen).toBe(true);
  });

  describe("per-dataset keying", () => {
    it("keeps separate arrangements per dataset", () => {
      writeMcapModalLayout({ layout: "image-1" }, "dataset-a");
      writeMcapModalLayout({ layout: "3d-1" }, "dataset-b");
      expect(readMcapModalLayout("dataset-a")?.layout).toBe("image-1");
      expect(readMcapModalLayout("dataset-b")?.layout).toBe("3d-1");
    });

    it("does not restore another dataset's arrangement for a never-seen dataset", () => {
      writeMcapModalLayout({ layout: "image-1" }, "dataset-a");
      writeMcapModalLayout({ layout: "3d-1" }, "dataset-b");
      expect(readMcapModalLayout("dataset-never-seen")).toBeNull();
      expect(readMcapModalLayout()).toBeNull();
    });

    it("does not fill missing fields from another dataset", () => {
      writeMcapModalLayout({ leftSidebarOpen: false }, "dataset-a");
      writeMcapModalLayout({ layout: "image-1" }, "dataset-b");
      const read = readMcapModalLayout("dataset-a");
      expect(read?.leftSidebarOpen).toBe(false);
      expect(read?.layout).toBeUndefined();
    });
  });

  describe("camera preferences", () => {
    it("isolates conventions by dataset and selected media field", () => {
      writeMcapCameraPreferences(
        { defaultTrackingMode: "free", preferredWorldFrameId: "map" },
        "dataset-a",
        "mcap",
      );
      writeMcapCameraPreferences(
        { defaultTrackingMode: "pose" },
        "dataset-a",
        "alternate_mcap",
      );
      writeMcapCameraPreferences(
        { defaultTrackingMode: "heading" },
        "dataset-b",
        "mcap",
      );

      expect(readMcapCameraPreferences("dataset-a", "mcap")).toEqual({
        defaultTrackingMode: "free",
        preferredWorldFrameId: "map",
      });
      expect(readMcapCameraPreferences("dataset-a", "alternate_mcap")).toEqual({
        defaultTrackingMode: "pose",
      });
      expect(readMcapCameraPreferences("dataset-b", "mcap")).toEqual({
        defaultTrackingMode: "heading",
      });
    });

    it("merges partial convention writes without erasing siblings", () => {
      writeMcapCameraPreferences(
        { preferredWorldFrameId: "map" },
        "dataset-a",
        "mcap",
      );
      writeMcapCameraPreferences(
        { preferredCameraTargetFrameId: "base_link" },
        "dataset-a",
        "mcap",
      );

      expect(readMcapCameraPreferences("dataset-a", "mcap")).toEqual({
        preferredCameraTargetFrameId: "base_link",
        preferredWorldFrameId: "map",
      });
    });

    it("sanitizes invalid modes and oversized frame ids", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: 1,
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

      expect(readMcapCameraPreferences("dataset-a", "mcap")).toEqual({
        preferredWorldFrameId: "map",
        sceneUpAxis: "z",
      });
    });

    it("keeps the newest field when the preference table reaches its limit", () => {
      for (let index = 0; index < 17; index += 1) {
        writeMcapCameraPreferences(
          { preferredWorldFrameId: `map-${index}` },
          "dataset-a",
          `mcap-${index}`,
        );
      }

      expect(readMcapCameraPreferences("dataset-a", "mcap-0")).toBeNull();
      expect(readMcapCameraPreferences("dataset-a", "mcap-16")).toEqual({
        preferredWorldFrameId: "map-16",
      });
    });
  });

  describe("sidebarWidthPx", () => {
    it("round-trips through a dataset entry", () => {
      writeMcapModalLayout({ sidebarWidthPx: 420 }, "dataset-a");
      expect(readMcapModalLayout("dataset-a")?.sidebarWidthPx).toBe(420);
    });

    it("drops non-numeric or non-positive widths but keeps valid fields", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: 1, fallback: { sidebarWidthPx: "wide" } }),
      );
      expect(readMcapModalLayout()?.sidebarWidthPx).toBeUndefined();
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: 1,
          fallback: { sidebarWidthPx: -5, leftSidebarOpen: true },
        }),
      );
      const read = readMcapModalLayout();
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
        writeMcapModalLayout({ layout: `image-${i}` }, `dataset-${i}`);
      }
      // Touch the oldest entry so it stops being the eviction candidate.
      vi.setSystemTime(5_000);
      writeMcapModalLayout({ leftSidebarOpen: true }, "dataset-0");
      // A 21st dataset evicts dataset-1 (now the least recently updated).
      vi.setSystemTime(5_001);
      writeMcapModalLayout({ layout: "image-20" }, "dataset-20");

      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      const keys = Object.keys(raw.byDataset);
      expect(keys).toHaveLength(20);
      expect(keys).not.toContain("dataset-1");
      expect(keys).toContain("dataset-0");
      expect(keys).toContain("dataset-20");
      // The evicted dataset starts from defaults from now on.
      expect(readMcapModalLayout("dataset-1")).toBeNull();
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

  describe("mcapTileTypeFromId", () => {
    it("strips the trailing suffix", () => {
      expect(mcapTileTypeFromId("camera-default")).toBe("camera");
      expect(mcapTileTypeFromId("lidar-12")).toBe("lidar");
      expect(mcapTileTypeFromId("image-annotation-3")).toBe("image-annotation");
    });

    it("returns null for ids without a suffix", () => {
      expect(mcapTileTypeFromId("camera")).toBeNull();
      expect(mcapTileTypeFromId("-3")).toBeNull();
      expect(mcapTileTypeFromId("camera-")).toBeNull();
    });
  });

  describe("plotSeries", () => {
    const SERIES = [
      { color: "#3987e5", fieldPath: "twist.linear.x", topic: "/odom" },
    ];

    it("round-trips per-dataset plot series", () => {
      writeMcapModalLayout({ plotSeries: { "plot-1": SERIES } }, "ds-a");
      expect(readMcapModalLayout("ds-a")?.plotSeries).toEqual({
        "plot-1": SERIES,
      });
    });

    it("never leaks plot config to another dataset", () => {
      writeMcapModalLayout({ leftSidebarOpen: true }, "ds-b");
      writeMcapModalLayout(
        { layout: "plot-1", plotSeries: { "plot-1": SERIES } },
        "ds-a",
      );

      expect(readMcapModalLayout("ds-b")).toEqual({ leftSidebarOpen: true });
      expect(readMcapModalLayout("ds-b")?.plotSeries).toBeUndefined();
    });

    it("sanitizes malformed plot series rows individually", () => {
      writeMcapModalLayout(
        {
          plotSeries: {
            "plot-1": [
              ...SERIES,
              { color: "not-a-color", fieldPath: "x", topic: "/t" },
              { color: "#ffffff", fieldPath: "", topic: "/t" },
              "garbage",
            ] as never,
            "image-1": SERIES,
            "no-suffix": SERIES,
          } as never,
        },
        "ds-a",
      );
      expect(readMcapModalLayout("ds-a")?.plotSeries).toEqual({
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

  describe("rawTopics", () => {
    it("round-trips per-dataset raw tile topics", () => {
      writeMcapModalLayout({ rawTopics: { "raw-1": "/imu" } }, "ds-a");
      expect(readMcapModalLayout("ds-a")?.rawTopics).toEqual({
        "raw-1": "/imu",
      });
    });

    it("never leaks raw topic config to another dataset", () => {
      writeMcapModalLayout({ leftSidebarOpen: true }, "ds-b");
      writeMcapModalLayout(
        { layout: "raw-1", rawTopics: { "raw-1": "/imu" } },
        "ds-a",
      );

      expect(readMcapModalLayout("ds-b")).toEqual({ leftSidebarOpen: true });
      expect(readMcapModalLayout("ds-b")?.rawTopics).toBeUndefined();
    });

    it("drops rows with non-raw tile ids or invalid topics", () => {
      writeMcapModalLayout(
        {
          rawTopics: {
            "raw-1": "/imu",
            "plot-1": "/odom",
            "no-suffix": "/x",
            "raw-2": "",
            "raw-3": 7,
          } as never,
        },
        "ds-a",
      );
      expect(readMcapModalLayout("ds-a")?.rawTopics).toEqual({
        "raw-1": "/imu",
      });
    });

    it("sanitizeRawTopics rejects non-object payloads", () => {
      expect(sanitizeRawTopics(null)).toBeUndefined();
      expect(sanitizeRawTopics([])).toBeUndefined();
      expect(sanitizeRawTopics("x")).toBeUndefined();
      expect(sanitizeRawTopics({})).toBeUndefined();
    });
  });

  describe("logSettings", () => {
    const SETTINGS = {
      "log-1": {
        enabledTopics: ["/rosout"],
        followPlayhead: false,
        // Canonical severity order, as the sanitizer normalizes it.
        selectedLevels: ["warn", "error"],
      },
    };

    it("round-trips per-dataset log tile settings", () => {
      writeMcapModalLayout({ logSettings: SETTINGS as never }, "ds-a");
      expect(readMcapModalLayout("ds-a")?.logSettings).toEqual(SETTINGS);
    });

    it("sanitizes malformed log settings rows individually", () => {
      writeMcapModalLayout(
        {
          logSettings: {
            "log-1": {
              enabledTopics: ["/rosout", "", "/rosout", 5],
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

      expect(readMcapModalLayout("ds-a")?.logSettings).toEqual({
        "log-1": {
          enabledTopics: ["/rosout"],
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
        enabledTopics: ["/gps/front", "/gps/rear"],
        followEgo: false,
      },
    };

    it("round-trips per-dataset map tile settings", () => {
      writeMcapModalLayout({ mapSettings: SETTINGS }, "ds-a");
      expect(readMcapModalLayout("ds-a")?.mapSettings).toEqual(SETTINGS);
    });

    it("never leaks map settings to another dataset", () => {
      writeMcapModalLayout({ leftSidebarOpen: true }, "ds-b");
      writeMcapModalLayout({ layout: "map-1", mapSettings: SETTINGS }, "ds-a");

      expect(readMcapModalLayout("ds-b")).toEqual({ leftSidebarOpen: true });
      expect(readMcapModalLayout("ds-b")?.mapSettings).toBeUndefined();
    });

    it("sanitizes malformed map settings rows individually", () => {
      writeMcapModalLayout(
        {
          mapSettings: {
            "map-1": {
              baseLayer: "none",
              enabledTopics: ["/gps", "", "/gps", 5],
              followEgo: false,
              styleUrl: "https://tiles.example.test/style.json",
            },
            "image-1": {
              enabledTopics: ["/camera"],
              followEgo: true,
            },
            "map-2": {
              baseLayer: "surprise",
              enabledTopics: [],
              followEgo: "yes",
            },
            "no-suffix": {
              enabledTopics: ["/gps"],
              followEgo: true,
            },
          } as never,
        },
        "ds-a",
      );

      expect(readMcapModalLayout("ds-a")?.mapSettings).toEqual({
        "map-1": {
          baseLayer: "none",
          enabledTopics: ["/gps"],
          followEgo: false,
        },
        "map-2": {
          baseLayer: "default",
          enabledTopics: [],
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
      writeMcapModalLayout(
        { tileTitles: { "image-1": "Front Camera" } },
        "ds-a",
      );
      expect(readMcapModalLayout("ds-a")?.tileTitles).toEqual({
        "image-1": "Front Camera",
      });
    });

    it("never leaks tile titles to another dataset", () => {
      writeMcapModalLayout({ leftSidebarOpen: true }, "ds-b");
      writeMcapModalLayout(
        { layout: "image-1", tileTitles: { "image-1": "Front Camera" } },
        "ds-a",
      );

      expect(readMcapModalLayout("ds-b")).toEqual({ leftSidebarOpen: true });
      expect(readMcapModalLayout("ds-b")?.tileTitles).toBeUndefined();
    });

    it("drops rows with invalid tile ids or titles", () => {
      writeMcapModalLayout(
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
      expect(readMcapModalLayout("ds-a")?.tileTitles).toEqual({
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
      writeMcapModalLayout({ sceneUpAxis: "y" }, "ds-a");
      expect(readMcapModalLayout("ds-a")?.sceneUpAxis).toBe("y");
    });

    it("never leaks scene up-axis to another dataset", () => {
      writeMcapModalLayout({ leftSidebarOpen: true }, "ds-b");
      writeMcapModalLayout({ layout: "3d-1", sceneUpAxis: "x" }, "ds-a");

      expect(readMcapModalLayout("ds-b")).toEqual({ leftSidebarOpen: true });
      expect(readMcapModalLayout("ds-b")?.sceneUpAxis).toBeUndefined();
    });

    it("drops invalid scene up-axis values but keeps valid fields", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: 1,
          byDataset: {
            "ds-a": {
              leftSidebarOpen: true,
              sceneUpAxis: "north",
              updatedAtMs: 1,
            },
          },
        }),
      );

      const read = readMcapModalLayout("ds-a");
      expect(read?.leftSidebarOpen).toBe(true);
      expect(read?.sceneUpAxis).toBeUndefined();
    });
  });
});

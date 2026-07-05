import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isValidMosaicLayout,
  mcapTileTypeFromId,
  readMcapModalLayout,
  sanitizePlotSeries,
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

  it("drops structurally invalid layouts but keeps valid fields", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        leftSidebarOpen: true,
        layout: { direction: "diagonal", first: "a", second: "b" },
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
        version: 2,
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

    it("falls back to the latest write anywhere for a never-seen dataset", () => {
      writeMcapModalLayout({ layout: "image-1" }, "dataset-a");
      writeMcapModalLayout({ layout: "3d-1" }, "dataset-b");
      expect(readMcapModalLayout("dataset-never-seen")?.layout).toBe("3d-1");
      expect(readMcapModalLayout()?.layout).toBe("3d-1");
    });

    it("resolves each field independently between entry and fallback", () => {
      writeMcapModalLayout({ leftSidebarOpen: false }, "dataset-a");
      writeMcapModalLayout({ layout: "image-1" }, "dataset-b");
      const read = readMcapModalLayout("dataset-a");
      // Own entry wins where present…
      expect(read?.leftSidebarOpen).toBe(false);
      // …and the fallback fills the fields it doesn't have.
      expect(read?.layout).toBe("image-1");
    });
  });

  describe("v1 migration", () => {
    it("reads a v1 payload as the fallback layer", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: 1,
          leftSidebarOpen: false,
          layout: "image-1",
        }),
      );
      const read = readMcapModalLayout("dataset-never-seen");
      expect(read?.leftSidebarOpen).toBe(false);
      expect(read?.layout).toBe("image-1");
    });

    it("migrates v1 fields into the v2 fallback on the first write", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: 1,
          leftSidebarOpen: false,
          layout: "image-1",
        }),
      );
      writeMcapModalLayout({ sidebarWidthPx: 400 }, "dataset-a");
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      expect(raw.version).toBe(2);
      expect(raw.fallback).toMatchObject({
        leftSidebarOpen: false,
        layout: "image-1",
        sidebarWidthPx: 400,
      });
      expect(readMcapModalLayout("dataset-a")?.sidebarWidthPx).toBe(400);
      // The pre-migration fields survived for other datasets too.
      expect(readMcapModalLayout("dataset-b")?.layout).toBe("image-1");
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
        JSON.stringify({ version: 2, fallback: { sidebarWidthPx: "wide" } }),
      );
      expect(readMcapModalLayout()?.sidebarWidthPx).toBeUndefined();
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: 2,
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
      // The evicted dataset resolves from the fallback from now on.
      expect(readMcapModalLayout("dataset-1")?.layout).toBe("image-20");
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

    it("never leaks plot series through the browser-wide fallback", () => {
      writeMcapModalLayout(
        { layout: "plot-1", plotSeries: { "plot-1": SERIES } },
        "ds-a",
      );
      // Another dataset inherits the layout via the fallback but not
      // the dataset-scoped series.
      const other = readMcapModalLayout("ds-b");
      expect(other?.layout).toBe("plot-1");
      expect(other?.plotSeries).toBeUndefined();
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

  describe("sceneUpAxis", () => {
    it("round-trips per-dataset scene up-axis", () => {
      writeMcapModalLayout({ sceneUpAxis: "y" }, "ds-a");
      expect(readMcapModalLayout("ds-a")?.sceneUpAxis).toBe("y");
    });

    it("never leaks scene up-axis through the browser-wide fallback", () => {
      writeMcapModalLayout({ layout: "3d-1", sceneUpAxis: "x" }, "ds-a");

      const other = readMcapModalLayout("ds-b");
      expect(other?.layout).toBe("3d-1");
      expect(other?.sceneUpAxis).toBeUndefined();
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

      const read = readMcapModalLayout("ds-a");
      expect(read?.leftSidebarOpen).toBe(true);
      expect(read?.sceneUpAxis).toBeUndefined();
    });
  });
});

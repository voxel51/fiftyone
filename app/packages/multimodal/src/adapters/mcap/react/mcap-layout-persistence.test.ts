import { beforeEach, describe, expect, it } from "vitest";
import {
  isValidMosaicLayout,
  mcapTileTypeFromId,
  readMcapModalLayout,
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
      rightSidebarOpen: false,
      layout: {
        direction: "row",
        first: "camera-default",
        second: "lidar-default",
        splitPercentage: 60,
      },
    });
    const read = readMcapModalLayout();
    expect(read?.leftSidebarOpen).toBe(true);
    expect(read?.rightSidebarOpen).toBe(false);
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
    writeMcapModalLayout({ rightSidebarOpen: true });
    const read = readMcapModalLayout();
    expect(read?.leftSidebarOpen).toBe(true);
    expect(read?.rightSidebarOpen).toBe(true);
    expect(read?.layout).toBe("camera-default");
  });

  it("treats corrupt JSON as nothing stored", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(readMcapModalLayout()).toBeNull();
  });

  it("rejects payloads from other schema versions", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 99, leftSidebarOpen: true })
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
      })
    );
    const read = readMcapModalLayout();
    expect(read?.leftSidebarOpen).toBe(true);
    expect(read?.layout).toBeUndefined();
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
        })
      ).toBe(true);
    });

    it("rejects empty ids, bad directions, and missing branches", () => {
      expect(isValidMosaicLayout("")).toBe(false);
      expect(isValidMosaicLayout(null)).toBe(false);
      expect(isValidMosaicLayout(42)).toBe(false);
      expect(isValidMosaicLayout({ direction: "row", first: "a-1" })).toBe(
        false
      );
      expect(
        isValidMosaicLayout({
          direction: "row",
          first: "a-1",
          second: "b-2",
          splitPercentage: "60",
        })
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
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadLayout, saveLayout } from "./layout-storage";
import type { TilingTile } from "./types";

const makeTile = (title: string): TilingTile => ({ title, render: () => null });

const TILES = {
  "camera-1": makeTile("camera"),
  "lidar-1": makeTile("lidar"),
};

const KEY = "fiftyone.tiling.layout.ds-abc";

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("saveLayout", () => {
  it("writes the layout under the dataset key", () => {
    saveLayout("ds-abc", "camera-1");
    expect(localStorage.getItem(KEY)).toBe(JSON.stringify("camera-1"));
  });

  it("writes a branch node correctly", () => {
    const node = {
      direction: "row" as const,
      first: "camera-1",
      second: "lidar-1",
    };
    saveLayout("ds-abc", node);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(node);
  });

  it("removes the key when layout is null", () => {
    localStorage.setItem(KEY, "{}");
    saveLayout("ds-abc", null);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("is a no-op when datasetId is undefined", () => {
    saveLayout(undefined, "camera-1");
    expect(localStorage.length).toBe(0);
  });

  it("swallows localStorage errors silently", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
      throw new DOMException("QuotaExceededError");
    });
    expect(() => saveLayout("ds-abc", "camera-1")).not.toThrow();
  });
});

describe("loadLayout", () => {
  it("returns undefined when datasetId is undefined", () => {
    expect(loadLayout(undefined, TILES)).toBeUndefined();
  });

  it("returns undefined when nothing has been saved", () => {
    expect(loadLayout("ds-abc", TILES)).toBeUndefined();
  });

  it("returns the layout when all leaf ids are in knownTiles", () => {
    const node = {
      direction: "row" as const,
      first: "camera-1",
      second: "lidar-1",
    };
    saveLayout("ds-abc", node);
    expect(loadLayout("ds-abc", TILES)).toEqual(node);
  });

  it("returns a single leaf node when it is in knownTiles", () => {
    saveLayout("ds-abc", "camera-1");
    expect(loadLayout("ds-abc", TILES)).toBe("camera-1");
  });

  it("returns undefined when a leaf id is absent from knownTiles", () => {
    saveLayout("ds-abc", "radar-1");
    expect(loadLayout("ds-abc", TILES)).toBeUndefined();
  });

  it("returns undefined when any one leaf in a branch is absent", () => {
    const node = {
      direction: "row" as const,
      first: "camera-1",
      second: "radar-1",
    };
    saveLayout("ds-abc", node);
    expect(loadLayout("ds-abc", TILES)).toBeUndefined();
  });

  it("returns undefined when the stored value is invalid JSON", () => {
    localStorage.setItem(KEY, "not-json{{{");
    expect(loadLayout("ds-abc", TILES)).toBeUndefined();
  });

  it("treats undefined knownTiles as an empty set (all ids unknown)", () => {
    saveLayout("ds-abc", "camera-1");
    expect(loadLayout("ds-abc", undefined)).toBeUndefined();
  });

  it("validates deeply nested layout trees", () => {
    const node = {
      direction: "column" as const,
      first: {
        direction: "row" as const,
        first: "camera-1",
        second: "lidar-1",
      },
      second: "camera-1",
    };
    saveLayout("ds-abc", node);
    expect(loadLayout("ds-abc", TILES)).toEqual(node);
  });

  it("returns undefined for a deep tree with one unknown leaf", () => {
    const node = {
      direction: "column" as const,
      first: {
        direction: "row" as const,
        first: "camera-1",
        second: "radar-1",
      },
      second: "lidar-1",
    };
    saveLayout("ds-abc", node);
    expect(loadLayout("ds-abc", TILES)).toBeUndefined();
  });
});

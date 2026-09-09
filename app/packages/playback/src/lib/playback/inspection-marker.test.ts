import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import { inspectionMarkerAtom } from "./atoms";
import { clearInspectionMarker, publishInspectionMarker } from "./store-access";

describe("playback inspection marker", () => {
  it("scopes state to each playback store", () => {
    const first = createStore();
    const second = createStore();
    publishInspectionMarker(first, "tile-a", 1.25);

    expect(first.get(inspectionMarkerAtom)).toEqual({
      ownerId: "tile-a",
      timeSec: 1.25,
    });
    expect(second.get(inspectionMarkerAtom)).toBeNull();
  });

  it("does not let stale cleanup clear a newer owner", () => {
    const store = createStore();
    publishInspectionMarker(store, "tile-a", 1);
    publishInspectionMarker(store, "tile-b", 2);

    clearInspectionMarker(store, "tile-a");
    expect(store.get(inspectionMarkerAtom)).toEqual({
      ownerId: "tile-b",
      timeSec: 2,
    });

    clearInspectionMarker(store, "tile-b");
    expect(store.get(inspectionMarkerAtom)).toBeNull();
  });
});

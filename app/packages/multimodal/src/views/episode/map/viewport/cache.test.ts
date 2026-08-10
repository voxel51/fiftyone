import { beforeEach, describe, expect, it } from "vitest";
import {
  canPreserveMapViewportBetweenSamples,
  readMapViewport,
  resetMapViewportCacheForTests,
  writeMapViewport,
} from "./cache";

describe("mcap map viewport cache", () => {
  beforeEach(() => {
    resetMapViewportCacheForTests();
  });

  it("warms later samples in the same dataset scope", () => {
    writeMapViewport("dataset-a", {
      latitude: 37.7749,
      longitude: -122.4194,
      zoom: 16,
    });

    expect(readMapViewport("dataset-a")).toEqual({
      latitude: 37.7749,
      longitude: -122.4194,
      zoom: 16,
    });
  });

  it("preserves a live camera only between samples in the same dataset", () => {
    expect(canPreserveMapViewportBetweenSamples("dataset-a", "dataset-a")).toBe(
      true,
    );
    expect(canPreserveMapViewportBetweenSamples("dataset-a", "dataset-b")).toBe(
      false,
    );
    expect(canPreserveMapViewportBetweenSamples(null, null)).toBe(false);
  });

  it("does not leak a viewport into another dataset", () => {
    writeMapViewport("dataset-a", {
      latitude: 37.7749,
      longitude: -122.4194,
      zoom: 16,
    });

    expect(readMapViewport("dataset-b")).toBeNull();
  });

  it("ignores invalid location data", () => {
    writeMapViewport("dataset-a", {
      latitude: 100,
      longitude: -122.4194,
      zoom: 16,
    });

    expect(readMapViewport("dataset-a")).toBeNull();
  });

  it("wraps continuous world-copy centers before caching", () => {
    writeMapViewport("dataset-a", {
      latitude: 0,
      longitude: 181,
      zoom: 8,
    });

    expect(readMapViewport("dataset-a")).toEqual({
      latitude: 0,
      longitude: -179,
      zoom: 8,
    });
  });

  it("keeps only the most recent dataset scopes", () => {
    for (let index = 0; index < 17; index += 1) {
      writeMapViewport(`dataset-${index}`, {
        latitude: index,
        longitude: -index,
        zoom: 12,
      });
    }

    expect(readMapViewport("dataset-0")).toBeNull();
    expect(readMapViewport("dataset-16")).toEqual({
      latitude: 16,
      longitude: -16,
      zoom: 12,
    });
  });
});

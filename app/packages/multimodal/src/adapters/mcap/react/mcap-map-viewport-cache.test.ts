import { beforeEach, describe, expect, it } from "vitest";
import {
  readMcapMapViewport,
  resetMcapMapViewportCacheForTests,
  writeMcapMapViewport,
} from "./mcap-map-viewport-cache";

describe("mcap map viewport cache", () => {
  beforeEach(() => {
    resetMcapMapViewportCacheForTests();
  });

  it("warms later samples in the same dataset scope", () => {
    writeMcapMapViewport("dataset-a", {
      latitude: 37.7749,
      longitude: -122.4194,
      zoom: 16,
    });

    expect(readMcapMapViewport("dataset-a")).toEqual({
      latitude: 37.7749,
      longitude: -122.4194,
      zoom: 16,
    });
  });

  it("does not leak a viewport into another dataset", () => {
    writeMcapMapViewport("dataset-a", {
      latitude: 37.7749,
      longitude: -122.4194,
      zoom: 16,
    });

    expect(readMcapMapViewport("dataset-b")).toBeNull();
  });

  it("ignores invalid location data", () => {
    writeMcapMapViewport("dataset-a", {
      latitude: 100,
      longitude: -122.4194,
      zoom: 16,
    });

    expect(readMcapMapViewport("dataset-a")).toBeNull();
  });

  it("keeps only the most recent dataset scopes", () => {
    for (let index = 0; index < 17; index += 1) {
      writeMcapMapViewport(`dataset-${index}`, {
        latitude: index,
        longitude: -index,
        zoom: 12,
      });
    }

    expect(readMcapMapViewport("dataset-0")).toBeNull();
    expect(readMcapMapViewport("dataset-16")).toEqual({
      latitude: 16,
      longitude: -16,
      zoom: 12,
    });
  });
});

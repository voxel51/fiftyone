import { beforeEach, describe, expect, it } from "vitest";
import {
  canPreserveEpisodeMapViewportBetweenSamples,
  readEpisodeMapViewport,
  resetEpisodeMapViewportCacheForTests,
  writeEpisodeMapViewport,
} from "./episode-map-viewport-cache";

describe("mcap map viewport cache", () => {
  beforeEach(() => {
    resetEpisodeMapViewportCacheForTests();
  });

  it("warms later samples in the same dataset scope", () => {
    writeEpisodeMapViewport("dataset-a", {
      latitude: 37.7749,
      longitude: -122.4194,
      zoom: 16,
    });

    expect(readEpisodeMapViewport("dataset-a")).toEqual({
      latitude: 37.7749,
      longitude: -122.4194,
      zoom: 16,
    });
  });

  it("preserves a live camera only between samples in the same dataset", () => {
    expect(
      canPreserveEpisodeMapViewportBetweenSamples("dataset-a", "dataset-a"),
    ).toBe(true);
    expect(
      canPreserveEpisodeMapViewportBetweenSamples("dataset-a", "dataset-b"),
    ).toBe(false);
    expect(canPreserveEpisodeMapViewportBetweenSamples(null, null)).toBe(false);
  });

  it("does not leak a viewport into another dataset", () => {
    writeEpisodeMapViewport("dataset-a", {
      latitude: 37.7749,
      longitude: -122.4194,
      zoom: 16,
    });

    expect(readEpisodeMapViewport("dataset-b")).toBeNull();
  });

  it("ignores invalid location data", () => {
    writeEpisodeMapViewport("dataset-a", {
      latitude: 100,
      longitude: -122.4194,
      zoom: 16,
    });

    expect(readEpisodeMapViewport("dataset-a")).toBeNull();
  });

  it("keeps only the most recent dataset scopes", () => {
    for (let index = 0; index < 17; index += 1) {
      writeEpisodeMapViewport(`dataset-${index}`, {
        latitude: index,
        longitude: -index,
        zoom: 12,
      });
    }

    expect(readEpisodeMapViewport("dataset-0")).toBeNull();
    expect(readEpisodeMapViewport("dataset-16")).toEqual({
      latitude: 16,
      longitude: -16,
      zoom: 12,
    });
  });
});

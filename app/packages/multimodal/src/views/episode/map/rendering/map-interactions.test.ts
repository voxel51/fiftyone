import { describe, expect, it } from "vitest";

import {
  measurementLineFeature,
  measurementPointFromMapEvent,
  timeNsFromMapEvent,
} from "./map-interactions";

describe("map interactions", () => {
  it("decodes layer timestamps and rejects malformed event payloads", () => {
    expect(
      timeNsFromMapEvent({
        features: [{ properties: { timeNs: "9007199254740993" } }],
      }),
    ).toBe(9_007_199_254_740_993n);
    expect(
      timeNsFromMapEvent({ features: [{ properties: { timeNs: "bad" } }] }),
    ).toBeNull();
  });

  it("normalizes pointer picks and committed measurement geometry", () => {
    const a = measurementPointFromMapEvent({ lngLat: { lat: 1, lng: 2 } });
    const b = measurementPointFromMapEvent({ lngLat: { lat: 3, lng: 4 } });

    expect(a).toEqual({ latitude: 1, longitude: 2 });
    expect(
      measurementPointFromMapEvent({ lngLat: { lat: Number.NaN, lng: 2 } }),
    ).toBeNull();
    expect(
      measurementLineFeature(a && b ? { a, b } : null).features[0]?.geometry
        .coordinates,
    ).toEqual([
      [2, 1],
      [4, 3],
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { mapViewportIsNearEvidence } from "./proximity";

const SAN_FRANCISCO_VIEWPORT = {
  latitude: 37.7749,
  longitude: -122.4194,
  zoom: 15,
};

describe("mapViewportIsNearEvidence", () => {
  it("accepts a marker inside the expanded viewport", () => {
    expect(
      mapViewportIsNearEvidence({
        bounds: null,
        height: 600,
        marker: { latitude: 37.7755, longitude: -122.4185 },
        viewport: SAN_FRANCISCO_VIEWPORT,
        width: 800,
      }),
    ).toBe(true);
  });

  it("rejects a cached street-level viewport far from the new recording", () => {
    expect(
      mapViewportIsNearEvidence({
        bounds: null,
        height: 600,
        marker: { latitude: 34.0522, longitude: -118.2437 },
        viewport: SAN_FRANCISCO_VIEWPORT,
        width: 800,
      }),
    ).toBe(false);
  });

  it("accepts route bounds that overlap the expanded viewport", () => {
    expect(
      mapViewportIsNearEvidence({
        bounds: {
          east: -122.41,
          north: 37.78,
          south: 37.77,
          west: -122.43,
        },
        height: 600,
        marker: null,
        viewport: SAN_FRANCISCO_VIEWPORT,
        width: 800,
      }),
    ).toBe(true);
  });

  it("handles evidence across the antimeridian", () => {
    expect(
      mapViewportIsNearEvidence({
        bounds: null,
        height: 600,
        marker: { latitude: 0, longitude: -179.9 },
        viewport: { latitude: 0, longitude: 179.9, zoom: 5 },
        width: 800,
      }),
    ).toBe(true);
  });

  it("preserves narrow antimeridian-crossing bounds", () => {
    const bounds = {
      east: -179.8,
      north: 0.1,
      south: -0.1,
      west: 179.8,
    };
    expect(
      mapViewportIsNearEvidence({
        bounds,
        height: 600,
        marker: null,
        viewport: { latitude: 0, longitude: 179.9, zoom: 5 },
        width: 800,
      }),
    ).toBe(true);
    expect(
      mapViewportIsNearEvidence({
        bounds,
        height: 600,
        marker: null,
        viewport: { latitude: 0, longitude: 0, zoom: 5 },
        width: 800,
      }),
    ).toBe(false);
  });

  it("accepts continuous unwrapped seam bounds near the wrapped viewport", () => {
    const bounds = { east: 180.2, north: 0.1, south: -0.1, west: 179.8 };
    expect(
      mapViewportIsNearEvidence({
        bounds,
        height: 600,
        marker: null,
        viewport: { latitude: 0, longitude: -179.9, zoom: 5 },
        width: 800,
      }),
    ).toBe(true);
    expect(
      mapViewportIsNearEvidence({
        bounds,
        height: 600,
        marker: null,
        viewport: { latitude: 0, longitude: 0, zoom: 5 },
        width: 800,
      }),
    ).toBe(false);
  });

  it("uses each valid evidence source independently", () => {
    expect(
      mapViewportIsNearEvidence({
        bounds: {
          east: -122.41,
          north: 37.78,
          south: 37.77,
          west: -122.43,
        },
        height: 600,
        marker: { latitude: Number.NaN, longitude: -122.4194 },
        viewport: SAN_FRANCISCO_VIEWPORT,
        width: 800,
      }),
    ).toBe(true);
    expect(
      mapViewportIsNearEvidence({
        bounds: {
          east: Number.POSITIVE_INFINITY,
          north: 37.78,
          south: 37.77,
          west: -122.43,
        },
        height: 600,
        marker: { latitude: 37.7749, longitude: -122.4194 },
        viewport: SAN_FRANCISCO_VIEWPORT,
        width: 800,
      }),
    ).toBe(true);
  });

  it("rejects invalid evidence when there is no valid alternative", () => {
    expect(
      mapViewportIsNearEvidence({
        bounds: null,
        height: 600,
        marker: { latitude: Number.NaN, longitude: -122.4194 },
        viewport: SAN_FRANCISCO_VIEWPORT,
        width: 800,
      }),
    ).toBe(false);
    expect(
      mapViewportIsNearEvidence({
        bounds: {
          east: Number.POSITIVE_INFINITY,
          north: 37.78,
          south: 37.77,
          west: -122.43,
        },
        height: 600,
        marker: null,
        viewport: SAN_FRANCISCO_VIEWPORT,
        width: 800,
      }),
    ).toBe(false);
  });

  it("rejects finite bounds whose longitude difference overflows", () => {
    expect(
      mapViewportIsNearEvidence({
        bounds: {
          east: -Number.MAX_VALUE,
          north: 1,
          south: -1,
          west: Number.MAX_VALUE,
        },
        height: 600,
        marker: null,
        viewport: SAN_FRANCISCO_VIEWPORT,
        width: 800,
      }),
    ).toBe(false);
  });

  it("rejects evidence when the viewport has no measurable surface", () => {
    expect(
      mapViewportIsNearEvidence({
        bounds: null,
        height: 0,
        marker: { latitude: 37.7749, longitude: -122.4194 },
        viewport: SAN_FRANCISCO_VIEWPORT,
        width: 800,
      }),
    ).toBe(false);
  });
});

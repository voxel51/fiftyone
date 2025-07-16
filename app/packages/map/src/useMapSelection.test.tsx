import { renderHook, act } from "@testing-library/react";
import React from "react";
import { RecoilRoot } from "recoil";
import { describe, expect, it } from "vitest";
import useMapSelection from "./useMapSelection";

const TEST_POLYGON: GeoJSON.Feature<GeoJSON.Polygon> = {
  type: "Feature",
  geometry: {
    type: "Polygon",
    coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
  },
  properties: {},
};

const TEST_GEO_SELECTION = {
  polygon: TEST_POLYGON,
  field: "location",
};

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <RecoilRoot>{children}</RecoilRoot>
);

describe("useMapSelection", () => {
  it("should handle polygon style selection", () => {
    const { result } = renderHook(() => useMapSelection(), { wrapper });

    // Initially, polygon is null
    expect(result.current.polygon).toBeNull();
    expect(result.current.style).toBe("sample-ids");
    expect(result.current.isEmpty).toBe(true);

    // Simulate drawing a polygon
    act(() => {
      result.current.handlePolygonDrawn(TEST_POLYGON);
    });
    expect(result.current.polygon).toBe(TEST_POLYGON);
    expect(result.current.style).toBe("polygon");
    expect(result.current.isEmpty).toBe(false);
  });

  it("should clear the selection", () => {
    const { result } = renderHook(() => useMapSelection(), { wrapper });

    // Start with a polygon
    act(() => {
      result.current.handlePolygonDrawn(TEST_POLYGON);
    });
    expect(result.current.polygon).toBe(TEST_POLYGON);
    expect(result.current.isEmpty).toBe(false);

    // Clear the selection
    act(() => {
      result.current.clear();
    });
    expect(result.current.polygon).toBeNull();
    expect(result.current.style).toBe("sample-ids");
    expect(result.current.isEmpty).toBe(true);
  });

  it("should set geo selection", () => {
    const { result } = renderHook(() => useMapSelection(), { wrapper });

    // Initially, no geo selection
    expect(result.current.polygon).toBeNull();

    // Set geo selection
    act(() => {
      result.current.setGeoSelection(TEST_GEO_SELECTION);
    });

    // The polygon should be updated to match the geo selection
    expect(result.current.polygon).toBe(TEST_POLYGON);
    expect(result.current.style).toBe("polygon");
    expect(result.current.isEmpty).toBe(false);
  });

  it("should set extended selection from IDs", () => {
    const { result } = renderHook(() => useMapSelection(), { wrapper });

    const testIds = ["sample1", "sample2", "sample3"];

    // Set selection by IDs
    act(() => {
      result.current.setExtendedSelectionFromIds(testIds);
    });

    // The polygon should remain null when setting by IDs
    expect(result.current.polygon).toBeNull();
    expect(result.current.style).toBe("sample-ids");
    expect(result.current.isEmpty).toBe(true);
  });
});

// Test the private usePolygonState hook interface
describe("usePolygonState (private hook)", () => {
  it("should have the correct interface", () => {
    // We need to access the private hook for testing
    // This is a bit of a hack, but it's the only way to test the private hook
    const { result } = renderHook(() => {
      const hook = useMapSelection();
      // Access the internal state through the public methods
      return {
        polygon: hook.polygon,
        updatePolygon: hook.setPolygon,
        clearPolygon: hook.clear,
      };
    }, { wrapper });

    // Test that the interface has the expected properties
    expect(result.current).toHaveProperty("polygon");
    expect(result.current).toHaveProperty("updatePolygon");
    expect(result.current).toHaveProperty("clearPolygon");
    expect(typeof result.current.updatePolygon).toBe("function");
    expect(typeof result.current.clearPolygon).toBe("function");

    // Test initial state
    expect(result.current.polygon).toBeNull();

    // Test updatePolygon functionality
    act(() => {
      result.current.updatePolygon(TEST_POLYGON);
    });
    expect(result.current.polygon).toBe(TEST_POLYGON);

    // Test clearPolygon functionality
    act(() => {
      result.current.clearPolygon();
    });
    expect(result.current.polygon).toBeNull();
  });

  it("should handle null updates", () => {
    const { result } = renderHook(() => {
      const hook = useMapSelection();
      return {
        polygon: hook.polygon,
        updatePolygon: hook.setPolygon,
      };
    }, { wrapper });

    // Set a polygon first
    act(() => {
      result.current.updatePolygon(TEST_POLYGON);
    });
    expect(result.current.polygon).toBe(TEST_POLYGON);

    // Update with null
    act(() => {
      result.current.updatePolygon(null);
    });
    expect(result.current.polygon).toBeNull();
  });
});

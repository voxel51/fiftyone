import { describe, expect, it } from "vitest";
import {
  DEFAULT_POINT_CLOUD_COLOR,
  resolvePointCloudColorOptions,
} from "./storage";

describe("resolvePointCloudColorOptions", () => {
  it("resolves defaults and overrides into render-ready colors", () => {
    const sources = [
      { id: "radar", sourceName: "/radar/front" },
      { id: "lidar", sourceName: "/lidar/top" },
    ];

    expect(resolvePointCloudColorOptions("lidar", sources, undefined)).toEqual({
      colorBy: "auto",
      colormap: "turbo",
      uniformColor: "#b8c2d1",
    });
    expect(
      resolvePointCloudColorOptions("lidar", sources, {
        colorBy: "intensity",
        colormap: "inferno",
        rangeMax: 20,
        rangeMin: 2,
        uniformColor: "#abcdef",
      }),
    ).toEqual({
      colorBy: "intensity",
      colormap: "inferno",
      rangeMax: 20,
      rangeMin: 2,
      uniformColor: "#abcdef",
    });
  });

  it("uses the fallback source and omits null ranges", () => {
    expect(
      resolvePointCloudColorOptions("missing", [], {
        ...DEFAULT_POINT_CLOUD_COLOR,
        rangeMax: null,
        rangeMin: null,
      }),
    ).toEqual({
      colorBy: "auto",
      colormap: "coolwarm",
      uniformColor: "#b8c2d1",
    });
  });
});

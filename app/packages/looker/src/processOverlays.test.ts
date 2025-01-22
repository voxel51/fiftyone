import { describe, expect, it } from "vitest";

import HeatmapOverlay from "./overlays/heatmap";
import SegmentationOverlay from "./overlays/segmentation";
import { filter } from "./processOverlays";

const EMPTY = {
  id: "",
  tags: [],
};

describe("test overlay processing", () => {
  it("filters heatmap without a map", () => {
    expect(filter(new HeatmapOverlay("test", EMPTY), {})).toBe(true);
  });

  it("filters segmentations without a mask", () => {
    expect(filter(new SegmentationOverlay("test", EMPTY), {})).toBe(true);
  });
});

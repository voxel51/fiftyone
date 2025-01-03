import { describe, expect, it } from "vitest";
import type { Coloring, Colorscale } from "../../state";
import { createPainter } from "./index";

describe("filter resolves correctly", () => {
  let coloring: Coloring;
  let colorscale: Colorscale;
  const painter = createPainter(async () => "#ffffff");
  it("skips undefined detection", async () => {
    expect(
      await painter.Detection({
        field: "field",
        coloring,
        colorscale,
        customizeColorSetting: [],
        label: undefined,
        labelTagColors: {},
        selectedLabelTags: [],
      })
    ).toBeUndefined();
  });

  it("skips undefined detections", async () => {
    expect(
      await painter.Detections({
        field: "field",
        coloring,
        colorscale,
        customizeColorSetting: [],
        label: undefined,
        labelTagColors: {},
        selectedLabelTags: [],
      })
    ).toBeUndefined();
  });

  it("skips undefined heatmap", async () => {
    expect(
      await painter.Heatmap({
        field: "field",
        coloring,
        colorscale,
        customizeColorSetting: [],
        label: undefined,
        labelTagColors: {},
        selectedLabelTags: [],
      })
    ).toBeUndefined();
  });

  it("skips undefined segmentation", async () => {
    expect(
      await painter.Segmentation({
        field: "field",
        coloring,
        colorscale,
        customizeColorSetting: [],
        label: undefined,
        labelTagColors: {},
        selectedLabelTags: [],
      })
    ).toBeUndefined();
  });
});

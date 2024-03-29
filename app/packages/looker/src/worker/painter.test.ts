import { describe, expect, it } from "vitest";

import { Coloring, Colorscale } from "../state";
import * as painter from "./painter";

describe("filter resolves correctly", () => {
  let coloring: Coloring;
  let colorscale: Colorscale;
  const factory = painter.PainterFactory(() => "#ffffff");
  it("skips undefined detection", async () => {
    expect(
      await factory.Detection(
        "field",
        undefined,
        coloring,
        [],
        colorscale,
        {},
        []
      )
    ).toBeUndefined();
  });

  it("skips undefined detections", async () => {
    expect(
      await factory.Detections(
        "field",
        undefined,
        coloring,
        [],
        colorscale,
        {},
        []
      )
    ).toBeUndefined();
  });

  it("skips undefined heatmap", async () => {
    expect(
      await factory.Heatmap(
        "field",
        undefined,
        coloring,
        [],
        colorscale,
        [],
        {}
      )
    ).toBeUndefined();
  });

  it("skips undefined segmentation", async () => {
    expect(
      await factory.Segmentation(
        "field",
        undefined,
        coloring,
        [],
        colorscale,
        [],
        {}
      )
    ).toBeUndefined();
  });
});

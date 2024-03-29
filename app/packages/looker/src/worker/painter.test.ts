import { describe, it } from "vitest";

import { Coloring, Colorscale } from "../state";
import * as painter from "./painter";

describe("filter resolves correctly", () => {
  let coloring: Coloring;
  let colorscale: Colorscale;
  const factory = painter.PainterFactory(() => "#ffffff");
  it("skips undefined detection", () => {
    factory.Detection("field", undefined, coloring, [], colorscale, {}, []);
  });

  it("skips undefined detections", () => {
    factory.Detections("field", undefined, coloring, [], colorscale, {}, []);
  });

  it("skips undefined heatmap", () => {
    factory.Heatmap("field", undefined, coloring, [], colorscale, [], {});
  });

  it("skips undefined segmentation", () => {
    factory.Segmentation("field", undefined, coloring, [], colorscale, [], {});
  });
});

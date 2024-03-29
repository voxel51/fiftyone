import { describe, it } from "vitest";

import * as deserializer from "./deserializer";

describe("filter resolves correctly", () => {
  it("skips undefined detection", () => {
    deserializer.DeserializerFactory.Detection(undefined, []);
  });

  it("skips undefined detections", () => {
    deserializer.DeserializerFactory.Detections(undefined, []);
  });

  it("skips undefined heatmap", () => {
    deserializer.DeserializerFactory.Heatmap(undefined, []);
  });

  it("skips undefined segmenation", () => {
    deserializer.DeserializerFactory.Segmentation(undefined, []);
  });
});

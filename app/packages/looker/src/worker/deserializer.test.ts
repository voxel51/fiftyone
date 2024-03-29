import { describe, it } from "vitest";

import * as deserializer from "./deserializer";

describe("filter resolves correctly", () => {
  it("skips undefined detection", () => {
    deserializer.DeserializerFactory.Detection(undefined, []);
    expect(deserializer.DeserializerFactory.Detection(undefined, [])).toBeUndefined();
  });

  it("skips undefined detections", () => {
    deserializer.DeserializerFactory.Detections(undefined, []);
    expect(deserializer.DeserializerFactory.Detections(undefined, [])).toBeUndefined();
  });

  it("skips undefined heatmap", () => {
    deserializer.DeserializerFactory.Heatmap(undefined, []);
    expect(deserializer.DeserializerFactory.Heatmap(undefined, [])).toBeUndefined();
  });

  it("skips undefined segmenation", () => {
    deserializer.DeserializerFactory.Segmentation(undefined, []);
    expect(deserializer.DeserializerFactory.Segmentation(undefined, [])).toBeUndefined();
  });
});

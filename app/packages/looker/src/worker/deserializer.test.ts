import { describe, expect, it } from "vitest";

import * as deserializer from "./deserializer";

describe("filter resolves correctly", () => {
  it("skips undefined detection", () => {
    expect(
      deserializer.DeserializerFactory.Detection(undefined, [])
    ).toBeUndefined();
  });

  it("skips undefined detections", () => {
    expect(
      deserializer.DeserializerFactory.Detections(undefined, [])
    ).toBeUndefined();
  });

  it("skips undefined heatmap", () => {
    expect(
      deserializer.DeserializerFactory.Heatmap(undefined, [])
    ).toBeUndefined();
  });

  it("skips undefined segmenation", () => {
    expect(
      deserializer.DeserializerFactory.Segmentation(undefined, [])
    ).toBeUndefined();
  });
});

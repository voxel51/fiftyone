import { describe, expect, it } from "vitest";

import DetectionOverlay from "./detection";
import * as index from "./index";

describe("filter resolves correctly", () => {
  it("omits undefined labels", () => {
    expect(index.fromLabel(DetectionOverlay)("field", undefined)).toStrictEqual(
      []
    );
  });

  it("resolves empty label lists", () => {
    expect(
      index.fromLabelList(DetectionOverlay, "detections")("field", undefined)
    ).toStrictEqual([]);
  });
});

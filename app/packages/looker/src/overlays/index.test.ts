import { describe, expect, it } from "vitest";

import DetectionOverlay from "./detection";
import * as index from "./index";

describe("label overlay processing", () => {
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

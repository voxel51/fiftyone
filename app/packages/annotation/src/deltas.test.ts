import { describe, expect, it } from "vitest";
import { buildAnnotationPath, buildJsonPath, type LabelProxy } from "./deltas";

describe("buildAnnotationPath", () => {
  describe("patches views (isGenerated=true)", () => {
    it("appends '.detections' for Detection labels in generated views", () => {
      const label: LabelProxy = {
        type: "Detection",
        path: "predictions",
        data: { _id: "label-1", label: "cat" },
        boundingBox: [0.1, 0.2, 0.3, 0.4],
      };
      expect(buildAnnotationPath(label, true)).toBe("predictions.detections");
    });

    it("does not append '.detections' for Classification labels in generated views", () => {
      const label: LabelProxy = {
        type: "Classification",
        path: "classifications",
        data: { _id: "label-1", label: "cat" },
      };
      expect(buildAnnotationPath(label, true)).toBe("classifications");
    });
  });

  describe("normal views (isGenerated=false)", () => {
    it("returns path unchanged for Detection labels", () => {
      const label: LabelProxy = {
        type: "Detection",
        path: "predictions",
        data: { _id: "label-1", label: "cat" },
        boundingBox: [0.1, 0.2, 0.3, 0.4],
      };
      expect(buildAnnotationPath(label, false)).toBe("predictions");
    });

    it("returns path unchanged for Classification labels", () => {
      const label: LabelProxy = {
        type: "Classification",
        path: "classifications",
        data: { _id: "label-1", label: "cat" },
      };
      expect(buildAnnotationPath(label, false)).toBe("classifications");
    });
  });
});

describe("buildJsonPath", () => {
  it("builds path from labelPath and operationPath", () => {
    expect(buildJsonPath("predictions.detections", "label")).toBe(
      "/predictions/detections/label"
    );
  });

  it("builds path with null labelPath (generated/patches views)", () => {
    // In generated views, labelPath is null because deltas are relative to the label
    expect(buildJsonPath(null, "label")).toBe("/label");
  });

  it("handles nested operation paths", () => {
    expect(buildJsonPath("predictions.detections", "bounding_box/0")).toBe(
      "/predictions/detections/bounding_box/0"
    );
  });

  it("handles deeply nested labelPath", () => {
    expect(buildJsonPath("a.b.c", "field")).toBe("/a/b/c/field");
  });
});

import { describe, expect, it } from "vitest";
import {
  buildAnnotationPath,
  buildJsonPath,
  buildSingleMutationDelta,
  type LabelProxy,
} from "./deltas";
import type { AnnotationLabel } from "@fiftyone/state";

type LabelData = AnnotationLabel["data"];

describe("delta calculation utilities", () => {
  describe("buildAnnotationPath", () => {
    describe("patches views (isGenerated=true)", () => {
      it("appends '.detections' for Detection labels in generated views", () => {
        const label: LabelProxy = {
          type: "Detection",
          path: "predictions",
          data: { _id: "label-1", label: "cat" } as LabelData,
          boundingBox: [0.1, 0.2, 0.3, 0.4],
        };
        expect(buildAnnotationPath(label, true)).toBe("predictions.detections");
      });

      it("does not append '.detections' for Classification labels in generated views", () => {
        const label: LabelProxy = {
          type: "Classification",
          path: "classifications",
          data: { _id: "label-1", label: "cat" } as LabelData,
        };
        expect(buildAnnotationPath(label, true)).toBe("classifications");
      });
    });

    describe("normal views (isGenerated=false)", () => {
      it("returns path unchanged for Detection labels", () => {
        const label: LabelProxy = {
          type: "Detection",
          path: "predictions",
          data: { _id: "label-1", label: "cat" } as LabelData,
          boundingBox: [0.1, 0.2, 0.3, 0.4],
        };
        expect(buildAnnotationPath(label, false)).toBe("predictions");
      });

      it("returns path unchanged for Classification labels", () => {
        const label: LabelProxy = {
          type: "Classification",
          path: "classifications",
          data: { _id: "label-1", label: "cat" } as LabelData,
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

  describe("buildSingleMutationDelta", () => {
    const path = "somePath";
    const fullSampleLabel = {
      _cls: "Classification",
      _id: "abc123",
      tags: ["reviewed"],
      label: "positive",
      confidence: 0.95,
    };
    const sampleData = {
      [path]: fullSampleLabel,
    };

    it("should preserve server fields (_cls, _id, tags) when new data is missing them", () => {
      const newData = { label: "negative" } as LabelData;

      const deltas = buildSingleMutationDelta(sampleData, path, newData);

      expect(deltas).toEqual([
        { op: "replace", path: "/label", value: "negative" },
      ]);
    });

    it("should generate correct deltas when new data has all fields", () => {
      const newData = { ...fullSampleLabel, label: "negative" } as LabelData;

      const deltas = buildSingleMutationDelta(sampleData, path, newData);

      expect(deltas).toEqual([
        { op: "replace", path: "/label", value: "negative" },
      ]);
    });

    it("should return empty deltas when nothing changed", () => {
      const deltas = buildSingleMutationDelta(sampleData, path, {
        ...fullSampleLabel,
      } as LabelData);

      expect(deltas).toEqual([]);
    });

    it("should allow new fields not in existing label", () => {
      const newData = {
        label: "positive",
        custom_attr: "new_value",
      } as unknown as LabelData;

      const deltas = buildSingleMutationDelta(sampleData, path, newData);

      expect(deltas).toEqual([
        { op: "add", path: "/custom_attr", value: "new_value" },
      ]);
    });

    it("should handle empty existing label (new field)", () => {
      const newData = {
        _cls: "Classification",
        _id: "new123",
        label: "positive",
      } as LabelData;

      const deltas = buildSingleMutationDelta({}, path, newData);

      // All fields should be "add" operations
      expect(deltas.every((d) => d.op === "add")).toBe(true);
      expect(deltas.find((d) => d.op === "remove")).toBeUndefined();
    });

    it("should allow new data to explicitly replace field values", () => {
      const newData = {
        _cls: "Classification",
        _id: "abc123",
        tags: ["reviewed", "updated"],
        label: "negative",
        confidence: 0.99,
      } as LabelData;

      const deltas = buildSingleMutationDelta(sampleData, path, newData);

      expect(deltas).toHaveLength(3);
      expect(deltas).toContainEqual({
        op: "replace",
        path: "/label",
        value: "negative",
      });
      expect(deltas).toContainEqual({
        op: "replace",
        path: "/confidence",
        value: 0.99,
      });
      expect(deltas).toContainEqual({
        op: "add",
        path: "/tags/1",
        value: "updated",
      });
    });
  });
});

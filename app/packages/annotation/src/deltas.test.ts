import { describe, expect, it } from "vitest";
import {
  buildAnnotationPath,
  buildDeletionDeltas,
  buildJsonPath,
  buildKeypointMutationDeltas,
  buildKeypointsMutationDeltas,
  buildSingleMutationDelta,
  type LabelProxy,
} from "./deltas";
import type { KeypointLabel } from "@fiftyone/lighter";
import type { AnnotationLabel } from "@fiftyone/state";
import type { Field } from "@fiftyone/utilities";

type LabelData = AnnotationLabel["data"];

const makeField = (embeddedDocType: string): Field =>
  ({
    embeddedDocType,
  } as Field);

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

  describe("buildKeypointMutationDeltas", () => {
    it("merges with existing single Keypoint and produces replace deltas", () => {
      const path = "kp";
      const existing: KeypointLabel = {
        _cls: "Keypoint",
        _id: "kp-1",
        label: "head",
        tags: [],
        points: [[0.1, 0.2]],
      } as unknown as KeypointLabel;
      const sample = { [path]: existing };

      const deltas = buildKeypointMutationDeltas(sample, {
        type: "Keypoint",
        path,
        data: {
          _cls: "Keypoint",
          _id: "kp-1",
          label: "shoulder",
          tags: [],
          points: [[0.1, 0.2]],
        } as unknown as KeypointLabel,
      });

      expect(deltas).toEqual([
        { op: "replace", path: "/label", value: "shoulder" },
      ]);
    });
  });

  describe("buildKeypointsMutationDeltas", () => {
    const path = "keypoints";
    const existingKeypoint: KeypointLabel = {
      _cls: "Keypoint",
      _id: "kp-1",
      label: "head",
      tags: ["foo"],
      points: [[0.1, 0.2]],
    } as unknown as KeypointLabel;

    it("upserts an existing keypoint by _id and merges server fields", () => {
      const sample = {
        [path]: { _cls: "Keypoints", keypoints: [existingKeypoint] },
      };

      const deltas = buildKeypointsMutationDeltas(sample, {
        type: "Keypoint",
        path,
        data: {
          _id: "kp-1",
          label: "shoulder",
        } as unknown as KeypointLabel,
      });

      expect(deltas).toEqual([
        { op: "replace", path: "/keypoints/0/label", value: "shoulder" },
      ]);
    });

    it("inserts a new keypoint when the _id is not present", () => {
      const sample = {
        [path]: { _cls: "Keypoints", keypoints: [existingKeypoint] },
      };

      const newKeypoint = {
        _cls: "Keypoint",
        _id: "kp-2",
        label: "foot",
        tags: [],
        points: [[0.5, 0.6]],
      } as unknown as KeypointLabel;

      const deltas = buildKeypointsMutationDeltas(sample, {
        type: "Keypoint",
        path,
        data: newKeypoint,
      });

      expect(deltas).toContainEqual({
        op: "add",
        path: "/keypoints/1",
        value: newKeypoint,
      });
    });

    it("seeds a keypoints list when none exists at the path", () => {
      const newKeypoint = {
        _cls: "Keypoint",
        _id: "kp-1",
        label: "head",
        tags: [],
        points: [[0.1, 0.2]],
      } as unknown as KeypointLabel;

      const deltas = buildKeypointsMutationDeltas(
        {},
        { type: "Keypoint", path, data: newKeypoint }
      );

      expect(deltas.some((d) => d.op === "add")).toBe(true);
    });
  });

  describe("buildDeletionDeltas (Keypoint)", () => {
    const path = "keypoints";

    it("filters out a keypoint by _id from a Keypoints list", () => {
      const sample = {
        [path]: {
          _cls: "Keypoints",
          keypoints: [
            {
              _cls: "Keypoint",
              _id: "kp-1",
              label: "head",
              points: [[0.1, 0.2]],
            },
            {
              _cls: "Keypoint",
              _id: "kp-2",
              label: "foot",
              points: [[0.5, 0.6]],
            },
          ],
        },
      };

      const deltas = buildDeletionDeltas(
        sample,
        {
          type: "Keypoint",
          path,
          data: { _id: "kp-1" } as unknown as KeypointLabel,
        },
        makeField("fiftyone.core.labels.Keypoints")
      );

      // fast-json-patch emits a "shift down + pop" sequence: the trailing
      // index is removed, and prior indices are rewritten to the surviving
      // elements.
      expect(deltas).toContainEqual({
        op: "remove",
        path: "/keypoints/1",
      });
      expect(deltas).toContainEqual({
        op: "replace",
        path: "/keypoints/0/_id",
        value: "kp-2",
      });
    });

    it("returns a root remove for a single Keypoint field", () => {
      const deltas = buildDeletionDeltas(
        { kp: { _cls: "Keypoint", _id: "kp-1" } },
        {
          type: "Keypoint",
          path: "kp",
          data: { _id: "kp-1" } as unknown as KeypointLabel,
        },
        makeField("fiftyone.core.labels.Keypoint")
      );

      expect(deltas).toEqual([{ op: "remove", path: "/" }]);
    });

    it("short-circuits to a root remove for generated views", () => {
      const deltas = buildDeletionDeltas(
        {},
        {
          type: "Keypoint",
          path: "keypoints",
          data: { _id: "kp-1" } as unknown as KeypointLabel,
        },
        makeField("fiftyone.core.labels.Keypoints"),
        true
      );

      expect(deltas).toEqual([{ op: "remove", path: "/" }]);
    });

    it("warns and returns [] when the keypoints list is missing", () => {
      const deltas = buildDeletionDeltas(
        {},
        {
          type: "Keypoint",
          path: "keypoints",
          data: { _id: "kp-1" } as unknown as KeypointLabel,
        },
        makeField("fiftyone.core.labels.Keypoints")
      );

      expect(deltas).toEqual([]);
    });
  });
});

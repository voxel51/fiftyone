import { describe, expect, it } from "vitest";
import {
  buildAnnotationPath,
  buildLabelFieldChange,
  type LabelProxy,
} from "./deltas";
import type { AnnotationLabel } from "@fiftyone/state";
import type { Field } from "@fiftyone/utilities";

type LabelData = AnnotationLabel["data"];

const makeField = (embeddedDocType: string): Field =>
  ({ embeddedDocType } as Field);

type SampleArg = Parameters<typeof buildLabelFieldChange>[0];

describe("buildAnnotationPath", () => {
  it("appends '.detections' for Detection labels in generated views", () => {
    const label: LabelProxy = {
      type: "Detection",
      path: "predictions",
      data: { _id: "l-1", label: "cat" } as LabelData,
      boundingBox: [0.1, 0.2, 0.3, 0.4],
    };
    expect(buildAnnotationPath(label, true)).toBe("predictions.detections");
  });

  it("leaves the path unchanged for non-generated views", () => {
    const label: LabelProxy = {
      type: "Detection",
      path: "predictions",
      data: { _id: "l-1", label: "cat" } as LabelData,
      boundingBox: [0.1, 0.2, 0.3, 0.4],
    };
    expect(buildAnnotationPath(label, false)).toBe("predictions");
  });

  it("does not append for Classification labels in generated views", () => {
    const label: LabelProxy = {
      type: "Classification",
      path: "classifications",
      data: { _id: "l-1", label: "cat" } as LabelData,
    };
    expect(buildAnnotationPath(label, true)).toBe("classifications");
  });
});

describe("buildLabelFieldChange", () => {
  const detectionsSchema = makeField("fiftyone.core.labels.Detections");

  const makeSample = (label = "cat") =>
    ({
      ground_truth: {
        _cls: "Detections",
        detections: [
          {
            _cls: "Detection",
            _id: "det-1",
            label,
            bounding_box: [0.1, 0.1, 0.2, 0.2],
          },
        ],
      },
      primitive_field: "initial",
    } as unknown as SampleArg);

  const detectionLabel = (data: Record<string, unknown>): LabelProxy =>
    ({
      type: "Detection",
      path: "ground_truth",
      data: data as LabelData,
      boundingBox: [0.1, 0.1, 0.2, 0.2],
    } as LabelProxy);

  it("captures a list-label mutation as old + new value", () => {
    const change = buildLabelFieldChange(
      makeSample(),
      detectionLabel({ _id: "det-1", label: "dog" }),
      detectionsSchema,
      "mutate",
      false
    );

    expect(change).not.toBeNull();
    expect(change?.field).toBe("ground_truth");
    expect(change?.listKey).toBe("detections");
    expect(change?.labelId).toBe("det-1");
    expect((change?.previousValue as { label: string }).label).toBe("cat");
    expect((change?.newValue as { label: string }).label).toBe("dog");
  });

  it("returns null when nothing changed (no phantom save)", () => {
    const change = buildLabelFieldChange(
      makeSample(),
      detectionLabel({ _id: "det-1", label: "cat" }),
      detectionsSchema,
      "mutate",
      false
    );
    expect(change).toBeNull();
  });

  it("captures an add (previousValue null) for a new element", () => {
    const change = buildLabelFieldChange(
      makeSample(),
      detectionLabel({ _id: "det-NEW", label: "bird" }),
      detectionsSchema,
      "mutate",
      false
    );
    expect(change?.labelId).toBe("det-NEW");
    expect(change?.previousValue).toBeNull();
    expect((change?.newValue as { label: string }).label).toBe("bird");
  });

  it("captures a deletion (newValue null)", () => {
    const change = buildLabelFieldChange(
      makeSample(),
      detectionLabel({ _id: "det-1" }),
      detectionsSchema,
      "delete",
      false
    );
    expect(change?.field).toBe("ground_truth");
    expect(change?.listKey).toBe("detections");
    expect(change?.labelId).toBe("det-1");
    expect(change?.newValue).toBeNull();
    expect((change?.previousValue as { label: string }).label).toBe("cat");
  });

  it("captures a primitive field change", () => {
    const label = {
      type: "Primitive",
      path: "primitive_field",
      data: "updated",
    } as unknown as LabelProxy;
    const change = buildLabelFieldChange(
      makeSample(),
      label,
      makeField("fiftyone.core.fields.StringField"),
      "mutate",
      false
    );
    expect(change).toEqual({
      field: "primitive_field",
      listKey: null,
      labelId: null,
      previousValue: "initial",
      newValue: "updated",
    });
  });

  it("returns null for an unchanged primitive", () => {
    const label = {
      type: "Primitive",
      path: "primitive_field",
      data: "initial",
    } as unknown as LabelProxy;
    const change = buildLabelFieldChange(
      makeSample(),
      label,
      makeField("fiftyone.core.fields.StringField"),
      "mutate",
      false
    );
    expect(change).toBeNull();
  });

  it("addresses the source list for a generated (flat) view", () => {
    // In a patches view the modal sample stores the label flat at the field;
    // the change must still target the source list (by type + id).
    const flatSample = {
      ground_truth: {
        _cls: "Detection",
        _id: "det-1",
        label: "cat",
        bounding_box: [0.1, 0.1, 0.2, 0.2],
      },
    } as unknown as SampleArg;

    const change = buildLabelFieldChange(
      flatSample,
      detectionLabel({ _id: "det-1", label: "dog" }),
      makeField("fiftyone.core.labels.Detection"),
      "mutate",
      true
    );

    expect(change?.field).toBe("ground_truth");
    expect(change?.listKey).toBe("detections");
    expect(change?.labelId).toBe("det-1");
    expect((change?.newValue as { label: string }).label).toBe("dog");
  });
});

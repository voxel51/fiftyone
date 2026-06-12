import { describe, expect, it } from "vitest";
import { buildLabelFieldDelta, type LabelProxy } from "./deltas";
import type { AnnotationLabel } from "@fiftyone/state";
import type { Field } from "@fiftyone/utilities";

type LabelData = AnnotationLabel["data"];

const makeField = (embeddedDocType: string): Field =>
  ({ embeddedDocType } as Field);

type SampleArg = Parameters<typeof buildLabelFieldDelta>[0];

describe("buildLabelFieldDelta", () => {
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
    const delta = buildLabelFieldDelta(
      makeSample(),
      detectionLabel({ _id: "det-1", label: "dog" }),
      detectionsSchema,
      "mutate",
      false
    );

    expect(delta).not.toBeNull();
    expect(delta?.field).toBe("ground_truth");
    expect(delta?.listKey).toBe("detections");
    expect(delta?.labelId).toBe("det-1");
    expect((delta?.previousValue as { label: string }).label).toBe("cat");
    expect((delta?.newValue as { label: string }).label).toBe("dog");
  });

  it("returns null when nothing changed (no phantom save)", () => {
    const delta = buildLabelFieldDelta(
      makeSample(),
      detectionLabel({ _id: "det-1", label: "cat" }),
      detectionsSchema,
      "mutate",
      false
    );
    expect(delta).toBeNull();
  });

  it("captures an add (previousValue null) for a new element", () => {
    const delta = buildLabelFieldDelta(
      makeSample(),
      detectionLabel({ _id: "det-NEW", label: "bird" }),
      detectionsSchema,
      "mutate",
      false
    );
    expect(delta?.labelId).toBe("det-NEW");
    expect(delta?.previousValue).toBeNull();
    expect((delta?.newValue as { label: string }).label).toBe("bird");
  });

  it("captures a deletion (newValue null)", () => {
    const delta = buildLabelFieldDelta(
      makeSample(),
      detectionLabel({ _id: "det-1" }),
      detectionsSchema,
      "delete",
      false
    );
    expect(delta?.field).toBe("ground_truth");
    expect(delta?.listKey).toBe("detections");
    expect(delta?.labelId).toBe("det-1");
    expect(delta?.newValue).toBeNull();
    expect((delta?.previousValue as { label: string }).label).toBe("cat");
  });

  it("captures a primitive field change", () => {
    const label = {
      type: "Primitive",
      path: "primitive_field",
      data: "updated",
    } as unknown as LabelProxy;
    const delta = buildLabelFieldDelta(
      makeSample(),
      label,
      makeField("fiftyone.core.fields.StringField"),
      "mutate",
      false
    );
    expect(delta).toEqual({
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
    const delta = buildLabelFieldDelta(
      makeSample(),
      label,
      makeField("fiftyone.core.fields.StringField"),
      "mutate",
      false
    );
    expect(delta).toBeNull();
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

    const delta = buildLabelFieldDelta(
      flatSample,
      detectionLabel({ _id: "det-1", label: "dog" }),
      makeField("fiftyone.core.labels.Detection"),
      "mutate",
      true
    );

    expect(delta?.field).toBe("ground_truth");
    expect(delta?.listKey).toBe("detections");
    expect(delta?.labelId).toBe("det-1");
    expect((delta?.newValue as { label: string }).label).toBe("dog");
  });

  it("reads the element by id for a generated array (evaluation patches)", () => {
    // Eval patches keep the field as a Detections array (unlike to_patches'
    // flat label), so the previous value is the matching element — not the
    // whole container.
    const delta = buildLabelFieldDelta(
      makeSample(),
      detectionLabel({ _id: "det-1", label: "dog" }),
      detectionsSchema,
      "mutate",
      true
    );

    expect(delta?.field).toBe("ground_truth");
    expect(delta?.listKey).toBe("detections");
    expect(delta?.labelId).toBe("det-1");
    expect((delta?.previousValue as { label: string }).label).toBe("cat");
    expect((delta?.newValue as { label: string }).label).toBe("dog");
  });
});

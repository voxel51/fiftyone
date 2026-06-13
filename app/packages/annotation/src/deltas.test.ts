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

  it("preserves server-only fields (_cls, tags) absent from the edited label", () => {
    // The editor's label carries only what it knows; the merge must retain
    // server-enriched fields (e.g. tags, _cls) it never saw, so the backend
    // sees only the genuinely-changed field. (develop: buildSingleMutationDelta
    // "should preserve server fields when new data is missing them".)
    const sample = {
      ground_truth: {
        _cls: "Detections",
        detections: [
          {
            _cls: "Detection",
            _id: "det-1",
            label: "cat",
            bounding_box: [0.1, 0.1, 0.2, 0.2],
            tags: ["reviewed"],
          },
        ],
      },
    } as unknown as SampleArg;

    const delta = buildLabelFieldDelta(
      sample,
      detectionLabel({ _id: "det-1", label: "dog" }),
      detectionsSchema,
      "mutate",
      false
    );

    const next = delta?.newValue as Record<string, unknown>;
    expect(next.label).toBe("dog");
    expect(next.tags).toEqual(["reviewed"]);
    expect(next._cls).toBe("Detection");
  });

  it("resolves the keypoints listKey for a Keypoint label", () => {
    // Exercises the non-Detection branch of the type→listKey map (develop had
    // dedicated buildKeypoint(s)MutationDeltas coverage).
    const sample = {
      points: {
        _cls: "Keypoints",
        keypoints: [
          {
            _cls: "Keypoint",
            _id: "kp-1",
            label: "nose",
            points: [[0.5, 0.5]],
          },
        ],
      },
    } as unknown as SampleArg;

    const keypointLabel = {
      type: "Keypoint",
      path: "points",
      data: { _id: "kp-1", label: "ear", points: [[0.5, 0.5]] },
    } as unknown as LabelProxy;

    const delta = buildLabelFieldDelta(
      sample,
      keypointLabel,
      makeField("fiftyone.core.labels.Keypoints"),
      "mutate",
      false
    );

    expect(delta?.listKey).toBe("keypoints");
    expect(delta?.labelId).toBe("kp-1");
    expect((delta?.newValue as { label: string }).label).toBe("ear");
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

  it("returns a non-null delta for a no-op when includeUnchanged is true", () => {
    // The pending-edits ledger always records (then resolves no-ops itself),
    // so capture must not pre-drop an unchanged edit. With includeUnchanged
    // the same no-op that returns null above yields a delta.
    const delta = buildLabelFieldDelta(
      makeSample(),
      detectionLabel({ _id: "det-1", label: "cat" }),
      detectionsSchema,
      "mutate",
      false,
      true
    );
    expect(delta).not.toBeNull();
    expect(delta?.labelId).toBe("det-1");
    expect((delta?.newValue as { label: string }).label).toBe("cat");
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

  it("stamps _cls on a new label whose overlay lacks it", () => {
    // A new label has no previous value to merge a _cls from; persisting it
    // without _cls would make it undeserializable. The delta must supply it.
    const delta = buildLabelFieldDelta(
      makeSample(),
      detectionLabel({ _id: "det-NEW", label: "bird" }),
      detectionsSchema,
      "mutate",
      false
    );
    expect((delta?.newValue as { _cls?: string })._cls).toBe("Detection");
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

import { AnnotationEngine, SampleLabelStore } from "@fiftyone/annotation";
import type { LabelData, Schema } from "@fiftyone/utilities";
import { Sample } from "@fiftyone/utilities";
import { atom } from "jotai";
import { describe, expect, it, vi } from "vitest";

// Keep buildNewLabelData's import graph hermetic (see createNew.test.ts).
vi.mock("../state", () => ({
  labelSchemaData: () => atom({ label_schema: undefined }),
  isFieldReadOnly: () => false,
}));
vi.mock("@fiftyone/lighter", () => ({
  InteractiveDetectionHandler: class {},
}));
vi.mock("./useAnnotationContext/selectors", () => ({
  defaultField: () => atom(null),
}));

const { moveLabelToField } = await import("./moveLabelToField");

const detectionsField = () => ({
  dbField: null,
  description: null,
  embeddedDocType: "fiftyone.core.labels.Detections",
  ftype: "fiftyone.core.fields.EmbeddedDocumentField",
  info: null,
  name: "",
  path: "",
  subfield: null,
  fields: {
    detections: {
      dbField: null,
      description: null,
      embeddedDocType: null,
      ftype: "fiftyone.core.fields.ListField",
      info: null,
      name: "",
      path: "",
      subfield: "fiftyone.core.fields.EmbeddedDocumentField",
    },
  },
});

const schema = {
  ground_truth: detectionsField(),
  predictions: detectionsField(),
} as unknown as Schema;

// The sidebar's copy of a label carries no `_cls`.
const moved = {
  _id: "d1",
  label: "cat",
  bounding_box: [0.4, 0.4, 0.2, 0.2],
} as LabelData;

const serverCopy = { ...moved, _cls: "Detection", attributes: {}, tags: [] };

describe("moveLabelToField", () => {
  it("leaves nothing to save once the move is persisted and reloaded", () => {
    const sample = new Sample({
      data: {
        ground_truth: { _cls: "Detections", detections: [moved] },
        predictions: { _cls: "Detections", detections: [] },
      },
      schema,
    });
    const engine = new AnnotationEngine();
    engine.registerStore(new SampleLabelStore("s1", sample));

    expect(
      moveLabelToField(
        engine,
        { data: moved, type: "Detection" },
        "ground_truth",
        "predictions",
      ),
    ).toBe(true);

    const patches = engine.getJsonPatch();
    expect(patches[0].deltas).toContainEqual({
      op: "add",
      path: "/predictions/detections/-",
      value: expect.objectContaining({ _cls: "Detection", _id: "d1" }),
    });

    engine.captureBaseline();
    engine.reconcilePersisted(patches);
    sample.setData({
      ground_truth: { _cls: "Detections", detections: [] },
      predictions: { _cls: "Detections", detections: [serverCopy] },
    });

    expect(engine.getJsonPatch()).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";

import { RegularLabel } from "./base";
import DetectionOverlay from "./detection";
import * as index from "./index";
import { getHashLabelColorByInstance } from "./util";

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

  it("resolves empty object label lists", () => {
    expect(
      index.fromLabelList(DetectionOverlay, "detections")("field", {})
    ).toStrictEqual([]);
  });

  it("label hash is generated correctly", () => {
    const hashLabelWithIndex0 = getHashLabelColorByInstance({
      id: "id-0",
      label: "zero-index-label",
      index: 0,
    } as RegularLabel);

    const hashLabelWithIndex1 = getHashLabelColorByInstance({
      id: "id-1",
      label: "one-index-label",
      index: 1,
    } as RegularLabel);

    const hashLabelWithUndefinedIndex = getHashLabelColorByInstance({
      id: "id-no-index",
      label: "label-no-index",
    } as RegularLabel);

    const hashLabelWithUndefinedIndexUndefinedId = getHashLabelColorByInstance({
      label: "only-label-no-index-no-id",
    } as RegularLabel);

    expect(hashLabelWithIndex0).toEqual("zero-index-label-0-");
    expect(hashLabelWithIndex1).toEqual("one-index-label-1-");
    expect(hashLabelWithUndefinedIndex).toEqual("label-no-index.id-no-index");
    expect(hashLabelWithUndefinedIndexUndefinedId).toEqual(
      "only-label-no-index-no-id"
    );
  });
});

const lf = (embeddedDocType: string, extra = {}) => ({
  name: "x",
  dbField: null,
  embeddedDocType,
  ftype: "fiftyone.core.fields.EmbeddedDocumentField",
  ...extra,
});

describe("getRenderFieldPaths", () => {
  const schema = {
    predictions: lf("fiftyone.core.labels.Detections", { name: "predictions" }),
    gt: lf("fiftyone.core.labels.Detection", { name: "gt" }),
    seg: lf("fiftyone.core.labels.Segmentation", { name: "seg" }),
    heat: lf("fiftyone.core.labels.Heatmap", { name: "heat" }),
    cls: lf("fiftyone.core.labels.Classifications", { name: "cls" }),
    // a list label reached through a db alias
    aliased: lf("fiftyone.core.labels.Detections", {
      name: "aliased",
      dbField: "aliased_db",
    }),
    // a vector is ignored entirely
    embedding: {
      name: "embedding",
      dbField: null,
      embeddedDocType: null,
      ftype: "fiftyone.core.fields.VectorField",
    },
    // video frames document: labels nested + frame_number
    frames: {
      name: "frames",
      dbField: null,
      embeddedDocType: null,
      ftype: "fiftyone.core.fields.ListField",
      fields: {
        detections: lf("fiftyone.core.labels.Detections", {
          name: "detections",
        }),
        frame_number: {
          name: "frame_number",
          dbField: null,
          embeddedDocType: null,
          ftype: "fiftyone.core.fields.FrameNumberField",
        },
      },
    },
  };

  const paths = index.getRenderFieldPaths(schema as never);

  it("emits a list label's leaves under its list subfield", () => {
    expect(paths).toContain("predictions.detections.bounding_box");
    expect(paths).toContain("predictions.detections.mask");
    expect(paths).toContain("predictions.detections.label");
    expect(paths).toContain("predictions.detections._id");
    // 3D cuboid geometry the Detection overlay declares
    expect(paths).toContain("predictions.detections.location");
  });

  it("emits a single label's leaves at its own path (no list subfield)", () => {
    expect(paths).toContain("gt.bounding_box");
    expect(paths).not.toContain("gt.detections.bounding_box");
  });

  it("emits only the leaves each overlay declares", () => {
    expect(paths).toContain("seg.mask");
    expect(paths).toContain("seg.mask_path");
    expect(paths).toContain("heat.map");
    expect(paths).toContain("heat.range");
    expect(paths).toContain("cls.classifications.label");
    // never the heavy/text-only leaves
    expect(paths).not.toContain("predictions.detections.logits");
    expect(paths).not.toContain("predictions.detections.confidence");
    expect(paths).not.toContain("seg.bounding_box");
  });

  it("respects db field aliases", () => {
    expect(paths).toContain("aliased_db.detections.bounding_box");
  });

  it("descends into the frames document and keys by frame number", () => {
    expect(paths).toContain("frames.detections.detections.bounding_box");
    expect(paths).toContain("frames.frame_number");
  });

  it("ignores vector fields", () => {
    expect(paths).not.toContain("embedding");
  });
});

import { describe, expect, it } from "vitest";
import { computeDefaultVisibleLabels } from "./labelsVisibility";

const sampleSchemaMock = {
  segmentation: {
    ftype: "fiftyone.core.labels.Segmentation",
    dbField: "segmentation",
    name: "segmentation",
    embeddedDocType: "fiftyone.core.labels.Segmentation",
    path: "segmentation",
    description: null,
    info: null,
    subfield: null,
  },
  detection: {
    ftype: "fiftyone.core.labels.Detection",
    dbField: "detection",
    name: "detection",
    embeddedDocType: "fiftyone.core.labels.Detection",
    path: "detection",
    description: null,
    info: null,
    subfield: null,
  },
  classification: {
    ftype: "fiftyone.core.labels.Classification",
    dbField: "classification",
    name: "classification",
    embeddedDocType: "fiftyone.core.labels.Classification",
    path: "classification",
    description: null,
    info: null,
    subfield: null,
  },
} as const;

const frameSchemaMock = {
  segmentation: {
    ftype: "fiftyone.core.labels.Segmentation",
    dbField: "frames.segmentation",
    name: "segmentation",
    embeddedDocType: "fiftyone.core.labels.Segmentation",
    path: "segmentation",
    description: null,
    info: null,
    subfield: null,
  },
} as const;

describe("computeDefaultVisibleLabels", () => {
  it("returns all non-dense labels when no config is provided", () => {
    const allSampleLabels = ["segmentation", "detection", "classification"];
    const allFrameLabels = ["frames.segmentation"];

    const result = computeDefaultVisibleLabels(
      sampleSchemaMock,
      frameSchemaMock,
      allSampleLabels,
      allFrameLabels,
      undefined
    );

    expect(result).toEqual(["detection", "classification"]);
  });

  it("respects 'include' config only", () => {
    const allSampleLabels = ["segmentation", "classification", "otherLabel"];
    const allFrameLabels = ["frames.segmentation"];

    const result = computeDefaultVisibleLabels(
      sampleSchemaMock,
      frameSchemaMock,
      allSampleLabels,
      allFrameLabels,
      { include: ["classification", "otherLabel"] }
    );

    expect(result).toEqual(["classification", "otherLabel"]);
  });

  it("respects 'exclude' config only", () => {
    const allSampleLabels = ["segmentation", "classification", "otherLabel"];
    const allFrameLabels = ["frames.segmentation"];

    const result = computeDefaultVisibleLabels(
      sampleSchemaMock,
      frameSchemaMock,
      allSampleLabels,
      allFrameLabels,
      { exclude: ["classification"] }
    );

    expect(result).toEqual([
      "segmentation",
      "otherLabel",
      "frames.segmentation",
    ]);
  });

  it("correctly applies both include & exclude", () => {
    const allSampleLabels = ["segmentation", "classification", "otherLabel"];
    const allFrameLabels = ["frames.segmentation"];

    const result = computeDefaultVisibleLabels(
      sampleSchemaMock,
      frameSchemaMock,
      allSampleLabels,
      allFrameLabels,
      {
        include: ["segmentation", "classification", "otherLabel"],
        exclude: ["classification"],
      }
    );

    expect(result).toEqual(["segmentation", "otherLabel"]);
  });
});

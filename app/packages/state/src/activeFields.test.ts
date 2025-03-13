import { describe, expect, it } from "vitest";
import { computeActiveFields } from "./activeFields";

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

describe("computeActiveFields", () => {
  it("returns all non-dense labels when no config is provided", () => {
    const allSampleLabels = ["segmentation", "detection", "classification"];
    const allFrameLabels = ["frames.segmentation"];

    const result = computeActiveFields(
      [...allSampleLabels, ...allFrameLabels],
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

    const result = computeActiveFields(
      [...allSampleLabels, ...allFrameLabels],
      sampleSchemaMock,
      frameSchemaMock,
      allSampleLabels,
      allFrameLabels,
      { paths: ["classification", "otherLabel"] }
    );

    expect(result).toEqual(["classification", "otherLabel"]);
  });

  it("respects 'exclude' config only", () => {
    const allSampleLabels = ["segmentation", "classification", "otherLabel"];
    const allFrameLabels = ["frames.segmentation"];

    const result = computeActiveFields(
      [...allSampleLabels, ...allFrameLabels],
      sampleSchemaMock,
      frameSchemaMock,
      allSampleLabels,
      allFrameLabels,
      { paths: ["classification"], exclude: true }
    );

    expect(result).toEqual([
      "segmentation",
      "otherLabel",
      "frames.segmentation",
    ]);
  });
});

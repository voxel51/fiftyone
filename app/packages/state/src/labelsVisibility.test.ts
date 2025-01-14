import { describe, expect, it } from "vitest";
import { computeDefaultVisibleLabels } from "./labelsVisibility";

const sampleSchemaMock = {
  detection: {
    ftype: "fiftyone.core.labels.Detections",
    dbField: "detection",
    name: "detection",
    embeddedDocType: "fiftyone.core.labels.Detections",
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
  detection: {
    ftype: "fiftyone.core.labels.Detections",
    dbField: "frames.detection",
    name: "detection",
    embeddedDocType: "fiftyone.core.labels.Detections",
    path: "detection",
    description: null,
    info: null,
    subfield: null,
  },
} as const;

describe("computeDefaultVisibleLabels", () => {
  it("returns all non-dense labels when no config is provided", () => {
    const allSampleLabels = ["detection", "classification"];
    const allFrameLabels = ["frames.detection"];

    const result = computeDefaultVisibleLabels(
      sampleSchemaMock,
      frameSchemaMock,
      allSampleLabels,
      allFrameLabels,
      undefined
    );

    expect(result).toEqual(["classification"]);
  });

  it("respects 'include' config only", () => {
    const allSampleLabels = ["detection", "classification", "otherLabel"];
    const allFrameLabels = ["frames.detection"];

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
    const allSampleLabels = ["detection", "classification", "otherLabel"];
    const allFrameLabels = ["frames.detection"];

    const result = computeDefaultVisibleLabels(
      sampleSchemaMock,
      frameSchemaMock,
      allSampleLabels,
      allFrameLabels,
      { exclude: ["classification"] }
    );

    expect(result).toEqual(["detection", "otherLabel", "frames.detection"]);
  });

  it("correctly applies both include & exclude", () => {
    const allSampleLabels = ["detection", "classification", "otherLabel"];
    const allFrameLabels = ["frames.detection"];

    const result = computeDefaultVisibleLabels(
      sampleSchemaMock,
      frameSchemaMock,
      allSampleLabels,
      allFrameLabels,
      {
        include: ["detection", "classification", "otherLabel"],
        exclude: ["classification"],
      }
    );

    expect(result).toEqual(["detection", "otherLabel"]);
  });
});

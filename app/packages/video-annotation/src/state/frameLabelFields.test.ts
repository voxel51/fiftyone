/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { LabelType } from "@fiftyone/utilities";
import { describe, expect, it } from "vitest";
import { toFrameLabelFields } from "./frameLabelFields";

const SCHEMA_TYPES: Record<string, string> = {
  "frames.boxes": "detections",
  "frames.box": "detection",
  "frames.lines": "polylines",
  "frames.cls": "classification",
  "frames.tags": "classifications",
  "frames.score": "regression",
  cls: "classification",
  score: "regression",
  boxes: "detections",
};

const PATHS = Object.keys(SCHEMA_TYPES);

describe("toFrameLabelFields", () => {
  it("registers a video's single-label frame fields as singletons", () => {
    expect(toFrameLabelFields(PATHS, (p) => SCHEMA_TYPES[p], false)).toEqual({
      "frames.boxes": LabelType.Detections,
      "frames.lines": LabelType.Polylines,
      "frames.cls": LabelType.Classification,
      "frames.score": LabelType.Regression,
    });
  });

  it("registers a dynamic group's bare member fields", () => {
    expect(toFrameLabelFields(PATHS, (p) => SCHEMA_TYPES[p], true)).toEqual({
      cls: LabelType.Classification,
      score: LabelType.Regression,
      boxes: LabelType.Detections,
    });
  });
});

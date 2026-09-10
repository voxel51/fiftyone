/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";
import { scopedEntries, scopedTo } from "./fields";

/** What a dataset with a Detections field and a Classification one looks like. */
const PATHS = [
  "filepath",
  "predictions",
  "predictions.detections",
  "predictions.detections.label",
  "predictions.detections.confidence",
  "predictions.detections.bounding_box",
  "ground_truth",
  "ground_truth.label",
  "ground_truth.confidence",
];

describe("scopedTo", () => {
  it("names a label's own fields, not the path to them", () => {
    // `FilterLabels("predictions", F("label") == "cat")` — the filter is
    // applied to each detection, so the detection's fields are what it names
    expect(scopedTo("predictions", PATHS)).toEqual([
      "bounding_box",
      "confidence",
      "label",
    ]);
  });

  it("keeps the children of a field that does not nest", () => {
    expect(scopedTo("ground_truth", PATHS)).toEqual(["confidence", "label"]);
  });

  it("has nothing to offer for a leaf", () => {
    expect(scopedTo("filepath", PATHS)).toEqual([]);
  });

  it("does not confuse a sibling sharing a prefix", () => {
    const paths = ["preds", "preds_old", "preds_old.label", "preds.label"];
    expect(scopedTo("preds", paths)).toEqual(["label"]);
  });
});

describe("scopedEntries", () => {
  it("remembers the full path each scoped name stands for", () => {
    // The schema knows fields by full path, so resolving what kind of value
    // `label` holds means asking about `predictions.detections.label`
    expect(scopedEntries("predictions", PATHS)).toEqual(
      new Map([
        ["bounding_box", "predictions.detections.bounding_box"],
        ["confidence", "predictions.detections.confidence"],
        ["label", "predictions.detections.label"],
      ]),
    );
  });

  it("maps unnested children to their direct paths", () => {
    expect(scopedEntries("ground_truth", PATHS)).toEqual(
      new Map([
        ["confidence", "ground_truth.confidence"],
        ["label", "ground_truth.label"],
      ]),
    );
  });
});

/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { JSONDeltas, LabelData } from "@fiftyone/utilities";
import { LabelType } from "@fiftyone/utilities";
import { describe, expect, it } from "vitest";
import { groupLabelCopies, groupLabelValues } from "./groupLabels";

const TYPES: Record<string, LabelType> = {
  label: LabelType.Classification,
  "meta.weather": LabelType.Classification,
  tags_list: LabelType.Classifications,
  detections: LabelType.Detections,
};

const VALUES: Record<string, LabelData> = {
  label: { _id: "c1", _cls: "Classification", label: "dog" },
  "meta.weather": { _id: "w1", _cls: "Classification", label: "rain" },
};

const reads = {
  labelType: (path: string) => TYPES[path] ?? LabelType.Unknown,
  value: (path: string) => VALUES[path],
};

describe("groupLabelValues", () => {
  it("collects each touched Classification field once with its current value", () => {
    const deltas = [
      { op: "replace", path: "/label/label", value: "dog" },
      { op: "add", path: "/label/confidence", value: 0.9 },
      { op: "replace", path: "/meta/weather/label", value: "rain" },
    ] as JSONDeltas;

    expect([...groupLabelValues(deltas, reads)]).toEqual([
      ["/label", VALUES.label],
      ["/meta/weather", VALUES["meta.weather"]],
    ]);
  });

  it("marks a deleted Classification null", () => {
    const deltas = [{ op: "remove", path: "/gone" }] as JSONDeltas;

    const values = groupLabelValues(deltas, {
      labelType: () => LabelType.Classification,
      value: () => undefined,
    });

    expect([...values]).toEqual([["/gone", null]]);
  });

  it("ignores frame ops, list labels, and non-label fields", () => {
    const deltas = [
      { op: "replace", path: "/frames/2/label/label", value: "cat" },
      { op: "add", path: "/tags_list/classifications/-", value: {} },
      { op: "remove", path: "/detections/detections/0" },
      { op: "replace", path: "/scene", value: "tunnel" },
    ] as JSONDeltas;

    expect(groupLabelValues(deltas, reads).size).toBe(0);
  });
});

describe("groupLabelCopies", () => {
  it("writes whole fields with a fresh id per copy and null for deletes", () => {
    let next = 0;
    const values = new Map<string, LabelData | null>([
      ["/label", { _id: "c1", label: "dog" } as LabelData],
      ["/gone", null],
    ]);

    expect(groupLabelCopies(values, () => `copy-${++next}`)).toEqual([
      {
        op: "add",
        path: "/label",
        value: { _id: "copy-1", _cls: "Classification", label: "dog" },
      },
      { op: "add", path: "/gone", value: null },
    ]);
  });
});

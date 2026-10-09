/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";

import type { DetectionLabel } from "../overlays/detection";
import type { Sample } from "../state";
import { process3DLabels } from "./threed-label-processor";

const schema = {
  ground_truth: {
    dbField: "ground_truth",
    embeddedDocType: "fiftyone.core.labels.Detections",
    fields: {},
    ftype: "fiftyone.core.fields.EmbeddedDocumentField",
    name: "ground_truth",
    path: "ground_truth",
  },
} as never;

const cuboid = (id: string): DetectionLabel =>
  ({
    _id: id,
    _cls: "Detection",
    dimensions: [1, 1, 1],
    label: "car",
    location: [0, 0, 0],
    rotation: [0, 0, 0],
  }) as unknown as DetectionLabel;

describe("process3DLabels", () => {
  it("projects the cuboids that follow a detection without 3D attributes", async () => {
    const detections = [
      { _id: "flat", _cls: "Detection", label: "car" } as never,
      cuboid("a"),
    ] as DetectionLabel[];
    const sample = {
      _id: "sample",
      ground_truth: { _cls: "Detections", detections },
    } as unknown as Sample;

    await expect(process3DLabels(schema, sample)).resolves.toBeUndefined();
    expect(detections[0].convexHull).toBeUndefined();
    expect(detections[1].convexHull).toHaveLength(4);
  });
});

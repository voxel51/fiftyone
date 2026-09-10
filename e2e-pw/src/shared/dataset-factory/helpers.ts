/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { OssLoader } from "src/oss/fixtures/loader";
import { writeToTmpFile } from "src/oss/utils/fs";
import type { LabelSchema } from "./types";

/**
 * Spec for a single detection seeded into an existing sample; `maskSize`
 * attaches a square all-ones mask of that side, making it a mask detection.
 */
export interface DetectionSpec {
  label: string;
  boundingBox: [number, number, number, number];
  maskSize?: number;
}

/**
 * Writes a `fo.Detections` value onto a sample in an existing dataset.
 * Tests should prefer this over inline `executePythonCode` so the
 * generated Python stays in one auditable place.
 *
 * @example
 * await DatasetFactory.seedDetections({
 *   datasetName: "merge-fixture",
 *   field: "instances",
 *   detections: [
 *     { label: "cat", boundingBox: [0.25, 0.4, 0.2, 0.2], maskSize: 50 },
 *     { label: "cat", boundingBox: [0.55, 0.4, 0.2, 0.2], maskSize: 50 },
 *   ],
 * });
 */
export const seedDetections = (() => {
  const loader = new OssLoader();
  return async ({
    datasetName,
    field,
    detections,
    sampleIndex = 0,
  }: {
    datasetName: string;
    field: string;
    detections: DetectionSpec[];
    sampleIndex?: number;
  }) => {
    const hasMask = detections.some((d) => d.maskSize);
    const detLines = detections
      .map((d, i) => {
        const mask = d.maskSize
          ? `, mask=np.ones((${d.maskSize}, ${d.maskSize}), dtype=bool)`
          : "";
        return `det_${i} = fo.Detection(label="${d.label}", bounding_box=[${d.boundingBox.join(", ")}]${mask})`;
      })
      .join("\n");
    const detRefs = detections.map((_, i) => `det_${i}`).join(", ");

    await loader.executePythonCode(`
import fiftyone as fo
${hasMask ? "import numpy as np" : ""}

dataset = fo.load_dataset("${datasetName}")
sample = list(dataset)[${sampleIndex}]

${detLines}

sample["${field}"] = fo.Detections(detections=[${detRefs}])
sample.save()
    `);
  };
})();

/**
 * Applies an annotation label schema to a field of an existing dataset and,
 * by default, activates it. Prefer {@link BaseDatasetOptions.labelSchemas}
 * when the schema is known at creation time.
 *
 * @example
 * await DatasetFactory.updateLabelSchema({
 *   datasetName,
 *   field: "ground_truth",
 *   schema: { type: "detections", classes: ["cat"], attributes: [], component: "dropdown" },
 * });
 */
export const updateLabelSchema = (() => {
  const loader = new OssLoader();
  return async ({
    activate = true,
    datasetName,
    field,
    schema,
  }: {
    datasetName: string;
    field: string;
    schema: LabelSchema;
    activate?: boolean;
  }) => {
    const schemaFile = writeToTmpFile(JSON.stringify(schema), "json");

    await loader.executePythonCode(`
import json

import fiftyone as fo

dataset = fo.load_dataset("${datasetName}")

with open("${schemaFile}") as f:
    dataset.update_label_schema("${field}", json.load(f), allow_new_attrs=True)

${
  activate
    ? `if "${field}" not in dataset.active_label_schemas:
    dataset.active_label_schemas = dataset.active_label_schemas + ["${field}"]`
    : ""
}
`);
  };
})();

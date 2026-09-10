/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { OssLoader } from "src/oss/fixtures/loader";
import { writeToTmpFile } from "src/oss/utils/fs";
import type { LabelSchema } from "./types";

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

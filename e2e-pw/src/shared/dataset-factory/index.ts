/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { createDataset } from "./creators";

export type * from "./types";
export type { LabelBuilders } from "./labels";

/**
 * Factory for creating FiftyOne datasets in test and fixture contexts.
 * `createDataset` is discriminated on `mediaType` (default `"image"`); every
 * kind takes the same `schema`, `labelSchemas`, `withSampleData`,
 * `mediaFields`, `appConfig`, `indexes` and `savedViews` options, inserts
 * fixed-id documents directly, and resolves with the inserted samples.
 *
 * @example
 * import { DatasetFactory } from "./dataset-factory";
 *
 * await DatasetFactory.createDataset({ datasetName: "test-dataset" });
 * await DatasetFactory.createDataset({ mediaType: "group", datasetName: "my-groups" });
 * await DatasetFactory.createDataset({ mediaType: "video", datasetName: "my-videos" });
 * await DatasetFactory.createDataset({ mediaType: "3d", datasetName: "my-scenes" });
 * await DatasetFactory.createDataset({ mediaType: "point-cloud", datasetName: "my-clouds" });
 * await DatasetFactory.createDataset({ mediaType: "multimodal", datasetName: "my-episodes" });
 */
export const DatasetFactory = {
  createDataset,
};

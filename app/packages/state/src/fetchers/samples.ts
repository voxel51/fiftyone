/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { getFetchFunction } from "@fiftyone/utilities";

// one record from the samples endpoint: a projected field slice + signed media urls, keyed by id
export interface SampleRow {
  id: string;
  urls: { field: string; url: string | null }[];
  fields: Record<string, unknown>;
  // per-tile aspect ratio, present only for the auto-AR grid
  aspectRatio?: number;
}

export interface SamplesRequest {
  datasetId: string;
  ids?: string[];
  after?: number;
  count?: number;
  // include the listed fields, or exclude the listed paths
  fields?: string[];
  exclude?: string[];
  view: unknown;
  filters?: unknown;
  dynamicGroup?: unknown;
  sortBy?: string;
  desc?: boolean;
  hint?: string;
  // skip the per-doc media open that reads width/height; set when inheriting a poster's aspect ratio
  skipMetadata?: boolean;
}

/**
 * The single sample-data reader for grid, modal, and imavid frames. The caller
 * builds the field list (see {@link sampleProjection}); the backend just projects.
 */
export const fetchSamples = async (
  request: SamplesRequest
): Promise<SampleRow[]> => {
  const { datasetId, ...body } = request;

  const response = (await getFetchFunction()(
    "POST",
    `/dataset/${encodeURIComponent(datasetId)}/samples`,
    body
  )) as { samples?: SampleRow[] };

  return response?.samples ?? [];
};

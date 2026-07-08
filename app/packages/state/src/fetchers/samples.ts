/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { getFetchFunction } from "@fiftyone/utilities";

// one record from the samples endpoint: field data + media urls, keyed by id
export interface SampleRow {
  id: string;
  urls: { field: string; url: string | null }[];
  fields: Record<string, unknown>;
  // present only when the request did not skip metadata
  aspectRatio?: number;
}

export interface SamplesRequest {
  datasetId: string;
  after?: number;
  count?: number;
  view: unknown;
  filters?: unknown;
  // group slice / sample filter (e.g. {group: {slice}})
  filter?: unknown;
  dynamicGroup?: unknown;
  // skip the per-doc media open that reads width/height; set when inheriting a poster's aspect ratio
  skipMetadata?: boolean;
}

/** Windowed, relay-free sample reader; serves the imavid frame stream. */
export const fetchSamples = async (
  request: SamplesRequest,
): Promise<SampleRow[]> => {
  const { datasetId, ...body } = request;

  const response = (await getFetchFunction()(
    "POST",
    `/dataset/${encodeURIComponent(datasetId)}/samples`,
    body,
  )) as { samples?: SampleRow[] };

  return response?.samples ?? [];
};

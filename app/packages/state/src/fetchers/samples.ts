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

// one ordered window of the grid spine: ids only (+ a dynamic group's frame
// count), the cheap id-only read that drives virtualized scrolling
export interface SpineEntry {
  id: string;
  // group's frame count from the spine's GroupBy (dynamic groups only); seeds the
  // imavid timeline total at modal open without a separate count query.
  groupCount?: number;
  // w/h ratio for justified (auto-AR) layout; only present when requested, null
  // when the sample has no metadata dimensions
  aspectRatio?: number | null;
}

export interface SpineResponse {
  spine: SpineEntry[];
  // offset to request next, or null at the end of the view
  next: number | null;
}

export interface SpineRequest {
  datasetId: string;
  after: number;
  view: unknown;
  filters?: unknown;
  filter?: unknown;
  sortBy?: string;
  desc?: boolean;
  hint?: string;
  // request per-item aspect ratio (justified layout); omit to keep the read index-only
  aspectRatio?: boolean;
}

/** The id-only grid spine reader (see {@link fetchSamples} for field data). */
export const fetchSpine = async (
  request: SpineRequest
): Promise<SpineResponse> => {
  const { datasetId, ...body } = request;

  return (await getFetchFunction()(
    "POST",
    `/dataset/${encodeURIComponent(datasetId)}/grid/samples`,
    body
  )) as SpineResponse;
};

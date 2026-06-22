/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { getFetchFunction } from "@fiftyone/utilities";

// One record from the samples endpoint: a projected FIELD SLICE (`fields`) + signed
// media `urls`, keyed by id. This is NOT a "sample" — the sample is assembled at
// runtime by joining the field slices the client has cached (overlay/complement/
// frame fields) by id.
export interface SampleRow {
  id: string;
  urls: { field: string; url: string | null }[];
  fields: Record<string, unknown>;
  // real per-tile aspect ratio, present ONLY for the auto-AR grid (fixed-AR tiles
  // lay out from the grid setting and never receive it)
  aspectRatio?: number;
}

export interface SamplesRequest {
  datasetId: string;
  ids?: string[];
  after?: number;
  count?: number;
  // the app sends the EXACT fields it needs (include) OR the paths to drop
  // (exclude); the backend is a thin projector and applies whichever is present
  fields?: string[];
  exclude?: string[];
  view: unknown;
  filters?: unknown;
  dynamicGroup?: unknown;
  sortBy?: string;
  desc?: boolean;
  hint?: string;
  // skip the per-doc media OPEN that reads width/height — set for frame/tile reads
  // that inherit a poster's aspect ratio (the dominant cost of a large group fetch)
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

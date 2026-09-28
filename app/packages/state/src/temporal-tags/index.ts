/**
 * Temporal tag route client and React hooks.
 *
 * Media-type neutral: the routes are sample-scoped, so every surface that can
 * put a playhead on a sample — multimodal episodes, video samples, video
 * slices of grouped datasets — reads and writes the same records through here.
 */
export { createTemporalTagsClient } from "./client";
export {
  invalidateDatasetTemporalTags,
  onTemporalTagsMutated,
  useDatasetTemporalTags,
  useSampleTemporalTagsFromDataset,
} from "./dataset-tags";
export { useSampleTemporalTags } from "./hooks";
export { TEMPORAL_TAG_INDEX_TYPE } from "./types";
export type { CreateTemporalTagsClientOptions } from "./client";
export type {
  CountDatasetTemporalTagsRequest,
  ClearSampleTemporalTagsRequest,
  CreateSampleTemporalTagsRequest,
  DeleteSampleTemporalTagsRequest,
  ListDatasetTemporalTagsRequest,
  ListSampleTemporalTagsRequest,
  SampleTemporalTagsRequest,
  TemporalTag,
  TemporalTagCreate,
  TemporalTagFilter,
  TemporalTagsClient,
  TemporalTagsStatus,
  TemporalTagUpdate,
  UpdateSampleTemporalTagRequest,
  UseSampleTemporalTagsOptions,
  UseSampleTemporalTagsResult,
} from "./types";

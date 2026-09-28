/**
 * Tag route client and React hooks.
 *
 * The transport itself lives in `@fiftyone/state` so the video surfaces can
 * reach it without depending on this package; what remains here is the sample
 * renderer adapter and this facade, which enterprise imports by path.
 */
export {
  createTemporalTagsClient,
  invalidateDatasetTemporalTags,
  TEMPORAL_TAG_INDEX_TYPE,
  useDatasetTemporalTags,
  useSampleTemporalTags,
  useSampleTemporalTagsFromDataset,
} from "@fiftyone/state";
export { useSampleRendererTemporalTags } from "./hooks";
export type {
  CountDatasetTemporalTagsRequest,
  ClearSampleTemporalTagsRequest,
  CreateSampleTemporalTagsRequest,
  CreateTemporalTagsClientOptions,
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
} from "@fiftyone/state";

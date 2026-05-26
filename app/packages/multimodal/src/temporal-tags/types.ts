/** Load state for temporal-tag React hooks. */
export type TemporalTagsStatus = "idle" | "loading" | "ready" | "error";

/** Filter for temporal-tag list/count/delete queries. */
export interface TemporalTagFilter {
  readonly anchors?: readonly string[];
  readonly end?: number;
  readonly indexType?: number;
  readonly start?: number;
  readonly tags?: readonly string[];
}

/** Persisted temporal tag returned by the backend. */
export interface TemporalTag {
  readonly end: number;
  readonly id: string;
  readonly indexType: number;
  readonly sampleId: string;
  readonly start: number;
  readonly tag: string;
  readonly anchor?: string;
  readonly createdAt?: string;
  readonly createdBy?: string;
  readonly lastModifiedAt?: string;
  readonly lastModifiedBy?: string;
}

/** Temporal tag payload accepted by sample-scoped create routes. */
export interface TemporalTagCreate {
  readonly end: number;
  readonly start: number;
  readonly tag: string;
  readonly anchor?: string;
  readonly createdBy?: string;
  readonly indexType?: number;
  readonly lastModifiedBy?: string;
}

/** Mutable temporal tag fields accepted by sample-scoped update routes. */
export interface TemporalTagUpdate {
  readonly end?: number;
  readonly start?: number;
  readonly tag?: string;
  readonly lastModifiedBy?: string;
}

/** Common request shape for sample-scoped temporal-tag operations. */
export interface SampleTemporalTagsRequest {
  readonly datasetId: string;
  readonly sampleId: string;
}

/** Request for listing temporal tags for one sample. */
export interface ListSampleTemporalTagsRequest
  extends SampleTemporalTagsRequest {
  readonly filter?: TemporalTagFilter;
}

/** Request for creating temporal tags for one sample. */
export interface CreateSampleTemporalTagsRequest
  extends SampleTemporalTagsRequest {
  readonly temporalTags: readonly TemporalTagCreate[];
}

/** Request for updating one persisted temporal tag for one sample. */
export interface UpdateSampleTemporalTagRequest
  extends SampleTemporalTagsRequest {
  readonly temporalTagId: string;
  readonly update: TemporalTagUpdate;
}

/** Request for deleting persisted temporal tags by ID for one sample. */
export interface DeleteSampleTemporalTagsRequest
  extends SampleTemporalTagsRequest {
  readonly ids: readonly string[];
}

/** Request for clearing temporal tags for one sample. */
export interface ClearSampleTemporalTagsRequest
  extends SampleTemporalTagsRequest {
  readonly filter?: TemporalTagFilter;
}

/** Request for listing temporal tags across a dataset. */
export interface ListDatasetTemporalTagsRequest {
  readonly datasetId: string;
  readonly filter?: TemporalTagFilter;
}

/** Request for counting temporal tag values across a dataset. */
export interface CountDatasetTemporalTagsRequest {
  readonly datasetId: string;
  readonly filter?: TemporalTagFilter;
}

/**
 * Client for the multimodal temporal-tag route surface.
 */
export interface TemporalTagsClient {
  createSampleTemporalTags(
    request: CreateSampleTemporalTagsRequest
  ): Promise<readonly TemporalTag[]>;
  clearSampleTemporalTags(
    request: ClearSampleTemporalTagsRequest
  ): Promise<number>;
  countDatasetTemporalTags(
    request: CountDatasetTemporalTagsRequest
  ): Promise<Readonly<Record<string, number>>>;
  deleteSampleTemporalTags(
    request: DeleteSampleTemporalTagsRequest
  ): Promise<number>;
  listDatasetTemporalTags(
    request: ListDatasetTemporalTagsRequest
  ): Promise<readonly TemporalTag[]>;
  listSampleTemporalTags(
    request: ListSampleTemporalTagsRequest
  ): Promise<readonly TemporalTag[]>;
  updateSampleTemporalTag(
    request: UpdateSampleTemporalTagRequest
  ): Promise<TemporalTag>;
}

/**
 * Hook options for sample-scoped temporal-tag loading.
 */
export interface UseSampleTemporalTagsOptions
  extends Partial<SampleTemporalTagsRequest> {
  readonly client?: TemporalTagsClient;
  readonly filter?: TemporalTagFilter;
}

/**
 * Hook result for sample-scoped temporal-tag loading and mutations.
 */
export interface UseSampleTemporalTagsResult {
  readonly error: string | null;
  readonly status: TemporalTagsStatus;
  readonly temporalTags: readonly TemporalTag[];
  readonly clear: (filter?: TemporalTagFilter) => Promise<number>;
  readonly create: (
    temporalTags: readonly TemporalTagCreate[]
  ) => Promise<readonly TemporalTag[]>;
  readonly delete: (ids: readonly string[]) => Promise<number>;
  readonly reload: () => Promise<readonly TemporalTag[]>;
  readonly update: (
    temporalTagId: string,
    update: TemporalTagUpdate
  ) => Promise<TemporalTag>;
}

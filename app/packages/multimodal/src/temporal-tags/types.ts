import type { LoadStatus } from "../load-status";

/** Load state for tag React hooks. */
export type TemporalTagsStatus = LoadStatus;

/** Filter for tag list/count/delete queries. */
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

/** Common request shape for sample-scoped tag operations. */
export interface SampleTagsRequest {
  readonly datasetId: string;
  readonly sampleId: string;
}

/** Request for listing tags for one sample. */
export interface ListSampleTagsRequest extends SampleTagsRequest {
  readonly filter?: TemporalTagFilter;
}

/** Request for creating temporal tags for one sample. */
export interface CreateSampleTagsRequest extends SampleTagsRequest {
  readonly temporalTags: readonly TemporalTagCreate[];
}

/** Request for updating one persisted temporal tag for one sample. */
export interface UpdateSampleTagRequest extends SampleTagsRequest {
  readonly temporalTagId: string;
  readonly update: TemporalTagUpdate;
}

/** Request for deleting persisted temporal tags by ID for one sample. */
export interface DeleteSampleTagsRequest extends SampleTagsRequest {
  readonly ids: readonly string[];
}

/** Request for clearing temporal tags for one sample. */
export interface ClearSampleTagsRequest extends SampleTagsRequest {
  readonly filter?: TemporalTagFilter;
}

/** Request for listing tags across a dataset. */
export interface ListDatasetTagsRequest {
  readonly datasetId: string;
  readonly filter?: TemporalTagFilter;
}

/** Request for counting tag values across a dataset. */
export interface CountDatasetTagsRequest {
  readonly datasetId: string;
  readonly filter?: TemporalTagFilter;
}

/**
 * Client for the multimodal tag route surface.
 */
export interface TemporalTagsClient {
  createSampleTemporalTags(
    request: CreateSampleTagsRequest
  ): Promise<readonly TemporalTag[]>;
  clearSampleTemporalTags(request: ClearSampleTagsRequest): Promise<number>;
  countDatasetTemporalTags(
    request: CountDatasetTagsRequest
  ): Promise<Readonly<Record<string, number>>>;
  deleteSampleTemporalTags(request: DeleteSampleTagsRequest): Promise<number>;
  listDatasetTemporalTags(
    request: ListDatasetTagsRequest
  ): Promise<readonly TemporalTag[]>;
  listSampleTemporalTags(
    request: ListSampleTagsRequest
  ): Promise<readonly TemporalTag[]>;
  updateSampleTemporalTag(
    request: UpdateSampleTagRequest
  ): Promise<TemporalTag>;
}

/**
 * Hook options for sample-scoped tag loading.
 */
export interface UseSampleTemporalTagsOptions
  extends Partial<SampleTagsRequest> {
  readonly client?: TemporalTagsClient;
  readonly filter?: TemporalTagFilter;
}

/**
 * Hook result for sample-scoped tag loading and mutations.
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

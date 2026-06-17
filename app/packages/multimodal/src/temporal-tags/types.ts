import type { LoadStatus } from "../load-status";

/** Load state for tag React hooks. */
export type TagsStatus = LoadStatus;

/** Filter for tag list/count/delete queries. */
export interface TagFilter {
  readonly anchors?: readonly string[];
  readonly end?: number;
  readonly indexType?: number;
  readonly start?: number;
  readonly tags?: readonly string[];
}

/** Persisted tag returned by the backend. */
export interface Tag {
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

/** Tag payload accepted by sample-scoped create routes. */
export interface TagCreate {
  readonly end: number;
  readonly start: number;
  readonly tag: string;
  readonly anchor?: string;
  readonly createdBy?: string;
  readonly indexType?: number;
  readonly lastModifiedBy?: string;
}

/** Mutable tag fields accepted by sample-scoped update routes. */
export interface TagUpdate {
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
  readonly filter?: TagFilter;
}

/** Request for creating tags for one sample. */
export interface CreateSampleTagsRequest extends SampleTagsRequest {
  readonly tags: readonly TagCreate[];
}

/** Request for updating one persisted tag for one sample. */
export interface UpdateSampleTagRequest extends SampleTagsRequest {
  readonly tagId: string;
  readonly update: TagUpdate;
}

/** Request for deleting persisted tags by ID for one sample. */
export interface DeleteSampleTagsRequest extends SampleTagsRequest {
  readonly ids: readonly string[];
}

/** Request for clearing tags for one sample. */
export interface ClearSampleTagsRequest extends SampleTagsRequest {
  readonly filter?: TagFilter;
}

/** Request for listing tags across a dataset. */
export interface ListDatasetTagsRequest {
  readonly datasetId: string;
  readonly filter?: TagFilter;
}

/** Request for counting tag values across a dataset. */
export interface CountDatasetTagsRequest {
  readonly datasetId: string;
  readonly filter?: TagFilter;
}

/**
 * Client for the tag route surface.
 */
export interface TagsClient {
  createSampleTags(request: CreateSampleTagsRequest): Promise<readonly Tag[]>;
  clearSampleTags(request: ClearSampleTagsRequest): Promise<number>;
  countDatasetTags(
    request: CountDatasetTagsRequest
  ): Promise<Readonly<Record<string, number>>>;
  deleteSampleTags(request: DeleteSampleTagsRequest): Promise<number>;
  listDatasetTags(request: ListDatasetTagsRequest): Promise<readonly Tag[]>;
  listSampleTags(request: ListSampleTagsRequest): Promise<readonly Tag[]>;
  updateSampleTag(request: UpdateSampleTagRequest): Promise<Tag>;
}

/**
 * Hook options for sample-scoped tag loading.
 */
export interface UseSampleTagsOptions extends Partial<SampleTagsRequest> {
  readonly client?: TagsClient;
  readonly filter?: TagFilter;
}

/**
 * Hook result for sample-scoped tag loading and mutations.
 */
export interface UseSampleTagsResult {
  readonly error: string | null;
  readonly status: TagsStatus;
  readonly tags: readonly Tag[];
  readonly clear: (filter?: TagFilter) => Promise<number>;
  readonly create: (tags: readonly TagCreate[]) => Promise<readonly Tag[]>;
  readonly delete: (ids: readonly string[]) => Promise<number>;
  readonly reload: () => Promise<readonly Tag[]>;
  readonly update: (tagId: string, update: TagUpdate) => Promise<Tag>;
}

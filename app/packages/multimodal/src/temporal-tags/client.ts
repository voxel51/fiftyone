import { getFetchFunctionExtended } from "@fiftyone/utilities";
import type {
  ClearSampleTemporalTagsRequest,
  CountDatasetTemporalTagsRequest,
  CreateSampleTagsRequest,
  DeleteSampleTemporalTagsRequest,
  ListDatasetTemporalTagsRequest,
  ListSampleTagsRequest,
  TemporalTag,
  TemporalTagCreate,
  TemporalTagFilter,
  TemporalTagsClient,
  TemporalTagUpdate,
  UpdateSampleTagRequest,
} from "./types";

type TemporalTagsFetch = ReturnType<typeof getFetchFunctionExtended>;

type TemporalTagDto = {
  readonly end: number;
  readonly id: string;
  readonly index_type: number;
  readonly sample_id: string;
  readonly start: number;
  readonly tag: string;
  readonly anchor?: string;
  readonly created_at?: string;
  readonly created_by?: string;
  readonly last_modified_at?: string;
  readonly last_modified_by?: string;
};

type TemporalTagsResponseDto = {
  readonly temporal_tags: readonly TemporalTagDto[];
};

type TemporalTagResponseDto = {
  readonly temporal_tag: TemporalTagDto;
};

type TemporalTagCountsResponseDto = {
  readonly counts: Readonly<Record<string, number>>;
};

type DeleteTemporalTagsResponseDto = {
  readonly deleted: number;
};

/**
 * Options for constructing the tags route client.
 */
export interface CreateTemporalTagsClientOptions {
  readonly fetchFunction?: TemporalTagsFetch;
}

/**
 * Creates a typed client for the tag HTTP routes.
 */
export function createTemporalTagsClient(
  options: CreateTemporalTagsClientOptions = {}
): TemporalTagsClient {
  const fetchFunction = options.fetchFunction ?? getFetchFunctionExtended();

  return {
    async createSampleTemporalTags({
      datasetId,
      sampleId,
      temporalTags,
    }: CreateSampleTagsRequest) {
      const response = await fetchFunction<
        { temporal_tags: readonly ReturnType<typeof temporalTagCreateDto>[] },
        TemporalTagsResponseDto
      >({
        body: {
          temporal_tags: temporalTags.map(temporalTagCreateDto),
        },
        method: "POST",
        path: `/dataset/${encodeURIComponent(
          datasetId
        )}/sample/${encodeURIComponent(sampleId)}/tags`,
      });

      return response.response.temporal_tags.map(temporalTagFromDto);
    },

    async clearSampleTemporalTags({
      datasetId,
      sampleId,
      filter,
    }: ClearSampleTemporalTagsRequest) {
      const response = await fetchFunction<
        ReturnType<typeof clearTemporalTagsDto>,
        DeleteTemporalTagsResponseDto
      >({
        body: clearTemporalTagsDto(filter),
        method: "DELETE",
        path: `/dataset/${encodeURIComponent(
          datasetId
        )}/sample/${encodeURIComponent(sampleId)}/tags`,
      });

      return response.response.deleted;
    },

    async countDatasetTemporalTags({
      datasetId,
      filter,
    }: CountDatasetTemporalTagsRequest) {
      const response = await fetchFunction<
        undefined,
        TemporalTagCountsResponseDto
      >({
        method: "GET",
        path: withFilterQuery(
          `/dataset/${encodeURIComponent(datasetId)}/tags/counts`,
          filter
        ),
      });

      return response.response.counts;
    },

    async deleteSampleTemporalTags({
      datasetId,
      sampleId,
      ids,
    }: DeleteSampleTemporalTagsRequest) {
      const response = await fetchFunction<
        ReturnType<typeof deleteTemporalTagsDto>,
        DeleteTemporalTagsResponseDto
      >({
        body: deleteTemporalTagsDto(ids),
        method: "DELETE",
        path: `/dataset/${encodeURIComponent(
          datasetId
        )}/sample/${encodeURIComponent(sampleId)}/tags`,
      });

      return response.response.deleted;
    },

    async listDatasetTemporalTags({
      datasetId,
      filter,
    }: ListDatasetTemporalTagsRequest) {
      const response = await fetchFunction<undefined, TemporalTagsResponseDto>({
        method: "GET",
        path: withFilterQuery(
          `/dataset/${encodeURIComponent(datasetId)}/tags`,
          filter
        ),
      });

      return response.response.temporal_tags.map(temporalTagFromDto);
    },

    async listSampleTemporalTags({
      datasetId,
      sampleId,
      filter,
    }: ListSampleTagsRequest) {
      const response = await fetchFunction<undefined, TemporalTagsResponseDto>({
        method: "GET",
        path: withFilterQuery(
          `/dataset/${encodeURIComponent(
            datasetId
          )}/sample/${encodeURIComponent(sampleId)}/tags`,
          filter
        ),
      });

      return response.response.temporal_tags.map(temporalTagFromDto);
    },

    async updateSampleTemporalTag({
      datasetId,
      sampleId,
      temporalTagId,
      update,
    }: UpdateSampleTagRequest) {
      const response = await fetchFunction<
        ReturnType<typeof temporalTagUpdateDto>,
        TemporalTagResponseDto
      >({
        body: temporalTagUpdateDto(update),
        method: "PATCH",
        path: `/dataset/${encodeURIComponent(
          datasetId
        )}/sample/${encodeURIComponent(sampleId)}/tags/${encodeURIComponent(
          temporalTagId
        )}`,
      });

      return temporalTagFromDto(response.response.temporal_tag);
    },
  };
}

function withFilterQuery(path: string, filter: TemporalTagFilter | undefined) {
  const params = filterQueryParams(filter);
  const queryString = params.toString();

  return queryString ? `${path}?${queryString}` : path;
}

function filterQueryParams(filter: TemporalTagFilter | undefined) {
  const params = new URLSearchParams();
  if (!filter) {
    return params;
  }

  appendValues(params, "anchors", filter.anchors);
  appendNumber(params, "end", filter.end);
  appendNumber(params, "index_type", filter.indexType);
  appendNumber(params, "start", filter.start);
  appendValues(params, "tags", filter.tags);

  return params;
}

function appendNumber(
  params: URLSearchParams,
  field: string,
  value: number | undefined
) {
  if (value !== undefined) {
    params.append(field, value.toString());
  }
}

function appendValues(
  params: URLSearchParams,
  field: string,
  value: readonly string[] | undefined
) {
  if (value === undefined) {
    return;
  }

  for (const item of value) {
    params.append(field, item);
  }
}

function temporalTagCreateDto(tag: TemporalTagCreate) {
  return stripUndefined({
    anchor: tag.anchor,
    created_by: tag.createdBy,
    end: tag.end,
    index_type: tag.indexType,
    last_modified_by: tag.lastModifiedBy,
    start: tag.start,
    tag: tag.tag,
  });
}

function temporalTagUpdateDto(update: TemporalTagUpdate) {
  return stripUndefined({
    end: update.end,
    last_modified_by: update.lastModifiedBy,
    start: update.start,
    tag: update.tag,
  });
}

function deleteTemporalTagsDto(ids: readonly string[]) {
  return { ids };
}

function clearTemporalTagsDto(filter: TemporalTagFilter | undefined) {
  return stripUndefined({
    delete_all: true,
    filter: filter ? filterDto(filter) : undefined,
  });
}

function filterDto(filter: TemporalTagFilter) {
  return stripUndefined({
    anchors: filter.anchors,
    end: filter.end,
    index_type: filter.indexType,
    start: filter.start,
    tags: filter.tags,
  });
}

function temporalTagFromDto(dto: TemporalTagDto): TemporalTag {
  return {
    anchor: dto.anchor,
    createdAt: dto.created_at,
    createdBy: dto.created_by,
    end: dto.end,
    id: dto.id,
    indexType: dto.index_type,
    lastModifiedAt: dto.last_modified_at,
    lastModifiedBy: dto.last_modified_by,
    sampleId: dto.sample_id,
    start: dto.start,
    tag: dto.tag,
  };
}

function stripUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter((entry) => entry[1] !== undefined)
  ) as Partial<T>;
}

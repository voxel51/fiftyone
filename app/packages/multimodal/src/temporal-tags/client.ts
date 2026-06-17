import { getFetchFunctionExtended } from "@fiftyone/utilities";
import type {
  ClearSampleTagsRequest,
  CountDatasetTagsRequest,
  CreateSampleTagsRequest,
  DeleteSampleTagsRequest,
  ListDatasetTagsRequest,
  ListSampleTagsRequest,
  Tag,
  TagCreate,
  TagFilter,
  TagUpdate,
  TagsClient,
  UpdateSampleTagRequest,
} from "./types";

type TagsFetch = ReturnType<typeof getFetchFunctionExtended>;

type TagDto = {
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

type TagsResponseDto = {
  readonly temporal_tags: readonly TagDto[];
};

type TagResponseDto = {
  readonly temporal_tag: TagDto;
};

type TagCountsResponseDto = {
  readonly counts: Readonly<Record<string, number>>;
};

type DeleteTagsResponseDto = {
  readonly deleted: number;
};

/**
 * Options for constructing the tags route client.
 */
export interface CreateTagsClientOptions {
  readonly fetchFunction?: TagsFetch;
}

/**
 * Creates a typed client for the tag HTTP routes.
 */
export function createTagsClient(
  options: CreateTagsClientOptions = {}
): TagsClient {
  const fetchFunction = options.fetchFunction ?? getFetchFunctionExtended();

  return {
    async createSampleTags({
      datasetId,
      sampleId,
      tags,
    }: CreateSampleTagsRequest) {
      const response = await fetchFunction<
        { temporal_tags: readonly ReturnType<typeof temporalTagCreateDto>[] },
        TagsResponseDto
      >({
        body: {
          temporal_tags: tags.map(temporalTagCreateDto),
        },
        method: "POST",
        path: `/dataset/${encodeURIComponent(
          datasetId
        )}/sample/${encodeURIComponent(sampleId)}/tags`,
      });

      return response.response.temporal_tags.map(temporalTagFromDto);
    },

    async clearSampleTags({
      datasetId,
      sampleId,
      filter,
    }: ClearSampleTagsRequest) {
      const response = await fetchFunction<
        ReturnType<typeof clearTagsDto>,
        DeleteTagsResponseDto
      >({
        body: clearTagsDto(filter),
        method: "DELETE",
        path: `/dataset/${encodeURIComponent(
          datasetId
        )}/sample/${encodeURIComponent(sampleId)}/tags`,
      });

      return response.response.deleted;
    },

    async countDatasetTags({ datasetId, filter }: CountDatasetTagsRequest) {
      const response = await fetchFunction<undefined, TagCountsResponseDto>({
        method: "GET",
        path: withFilterQuery(
          `/dataset/${encodeURIComponent(datasetId)}/tags/counts`,
          filter
        ),
      });

      return response.response.counts;
    },

    async deleteSampleTags({
      datasetId,
      sampleId,
      ids,
    }: DeleteSampleTagsRequest) {
      const response = await fetchFunction<
        ReturnType<typeof deleteTagsDto>,
        DeleteTagsResponseDto
      >({
        body: deleteTagsDto(ids),
        method: "DELETE",
        path: `/dataset/${encodeURIComponent(
          datasetId
        )}/sample/${encodeURIComponent(sampleId)}/tags`,
      });

      return response.response.deleted;
    },

    async listDatasetTags({ datasetId, filter }: ListDatasetTagsRequest) {
      const response = await fetchFunction<undefined, TagsResponseDto>({
        method: "GET",
        path: withFilterQuery(
          `/dataset/${encodeURIComponent(datasetId)}/tags`,
          filter
        ),
      });

      return response.response.temporal_tags.map(temporalTagFromDto);
    },

    async listSampleTags({
      datasetId,
      sampleId,
      filter,
    }: ListSampleTagsRequest) {
      const response = await fetchFunction<undefined, TagsResponseDto>({
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

    async updateSampleTag({
      datasetId,
      sampleId,
      tagId,
      update,
    }: UpdateSampleTagRequest) {
      const response = await fetchFunction<
        ReturnType<typeof temporalTagUpdateDto>,
        TagResponseDto
      >({
        body: temporalTagUpdateDto(update),
        method: "PATCH",
        path: `/dataset/${encodeURIComponent(
          datasetId
        )}/sample/${encodeURIComponent(sampleId)}/tags/${encodeURIComponent(tagId)}`,
      });

      return temporalTagFromDto(response.response.temporal_tag);
    },
  };
}

function withFilterQuery(path: string, filter: TagFilter | undefined) {
  const params = filterQueryParams(filter);
  const queryString = params.toString();

  return queryString ? `${path}?${queryString}` : path;
}

function filterQueryParams(filter: TagFilter | undefined) {
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

function temporalTagCreateDto(tag: TagCreate) {
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

function temporalTagUpdateDto(update: TagUpdate) {
  return stripUndefined({
    end: update.end,
    last_modified_by: update.lastModifiedBy,
    start: update.start,
    tag: update.tag,
  });
}

function deleteTagsDto(ids: readonly string[]) {
  return { ids };
}

function clearTagsDto(filter: TagFilter | undefined) {
  return stripUndefined({
    delete_all: true,
    filter: filter ? filterDto(filter) : undefined,
  });
}

function filterDto(filter: TagFilter) {
  return stripUndefined({
    anchors: filter.anchors,
    end: filter.end,
    index_type: filter.indexType,
    start: filter.start,
    tags: filter.tags,
  });
}

function temporalTagFromDto(dto: TagDto): Tag {
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

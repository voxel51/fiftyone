import type { SampleRendererProps } from "@fiftyone/plugins";
import { useCallback, useEffect, useRef, useState } from "react";
import { createTagsClient } from "./client";
import type {
  Tag,
  TagCreate,
  TagFilter,
  TagUpdate,
  TagsClient,
  TemporalTagsStatus,
  UseSampleTagsOptions,
  UseSampleTagsResult,
} from "./types";

type TagsState = {
  readonly error: string | null;
  readonly status: TemporalTagsStatus;
  readonly tags: readonly Tag[];
};

const IDLE_STATE: TagsState = {
  error: null,
  status: "idle",
  tags: [],
};
let defaultTagsClient: TagsClient | undefined;

/**
 * Loads and mutates temporal tags for one dataset sample.
 */
export function useSampleTemporalTags({
  client,
  datasetId,
  filter,
  sampleId,
}: UseSampleTagsOptions): UseSampleTagsResult {
  const tagsClient = client ?? getDefaultTagsClient();
  const filterKey = temporalTagFilterKey(filter);
  const [state, setState] = useState<TagsState>(IDLE_STATE);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  const reload = useCallback(async () => {
    if (!datasetId || !sampleId) {
      requestIdRef.current += 1;
      if (mountedRef.current) {
        setState(IDLE_STATE);
      }
      return [];
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    if (mountedRef.current) {
      setState((current) => ({
        error: null,
        status: "loading",
        tags: current.tags,
      }));
    }

    try {
      const tags = await tagsClient.listSampleTags({
        datasetId,
        filter,
        sampleId,
      });
      if (mountedRef.current && requestIdRef.current === requestId) {
        setState({
          error: null,
          status: "ready",
          tags,
        });
      }
      return tags;
    } catch (error) {
      if (mountedRef.current && requestIdRef.current === requestId) {
        setState({
          error: errorMessage(error),
          status: "error",
          tags: [],
        });
      }
      throw error;
    }
    // `filterKey` captures filter content changes while avoiding callback churn
    // when callers pass a new object with the same filter values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId, filterKey, sampleId, tagsClient]);

  useEffect(() => {
    void reload().catch(() => undefined);
  }, [reload]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  const create = useCallback(
    async (tags: readonly TagCreate[]) => {
      const ids = requireSampleScope(datasetId, sampleId);
      const created = await tagsClient.createSampleTags({
        ...ids,
        tags,
      });
      await reload();

      return created;
    },
    [datasetId, reload, sampleId, tagsClient]
  );

  const update = useCallback(
    async (temporalTagId: string, update: TagUpdate) => {
      const ids = requireSampleScope(datasetId, sampleId);
      const updated = await tagsClient.updateSampleTag({
        ...ids,
        temporalTagId,
        update,
      });
      await reload();

      return updated;
    },
    [datasetId, reload, sampleId, tagsClient]
  );

  const deleteTags = useCallback(
    async (idsToDelete: readonly string[]) => {
      const ids = requireSampleScope(datasetId, sampleId);
      const deleted = await tagsClient.deleteSampleTags({
        ...ids,
        ids: idsToDelete,
      });
      await reload();

      return deleted;
    },
    [datasetId, reload, sampleId, tagsClient]
  );

  const clear = useCallback(
    async (clearFilter?: TagFilter) => {
      const ids = requireSampleScope(datasetId, sampleId);
      const deleted = await tagsClient.clearSampleTags({
        ...ids,
        filter: clearFilter,
      });
      await reload();

      return deleted;
    },
    [datasetId, reload, sampleId, tagsClient]
  );

  return {
    ...state,
    clear,
    create,
    delete: deleteTags,
    reload,
    update,
  };
}

/**
 * Loads temporal tags for a sample renderer context.
 */
export function useSampleRendererTags(
  ctx: SampleRendererProps["ctx"],
  options: {
    readonly client?: TagsClient;
    readonly filter?: TagFilter;
  } = {}
) {
  return useSampleTemporalTags({
    client: options.client,
    datasetId: ctx.dataset.datasetId,
    filter: options.filter,
    sampleId: ctx.sample.sample._id,
  });
}

function requireSampleScope(
  datasetId: string | undefined,
  sampleId: string | undefined
) {
  if (!datasetId || !sampleId) {
    throw new Error("datasetId and sampleId are required");
  }

  return { datasetId, sampleId };
}

function temporalTagFilterKey(filter: TagFilter | undefined) {
  if (!filter) {
    return "";
  }

  return JSON.stringify(filter);
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function getDefaultTagsClient() {
  defaultTagsClient ??= createTagsClient();

  return defaultTagsClient;
}

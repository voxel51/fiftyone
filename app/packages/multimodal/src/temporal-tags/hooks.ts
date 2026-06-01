import type { SampleRendererProps } from "@fiftyone/plugins";
import { useCallback, useEffect, useRef, useState } from "react";
import { createTemporalTagsClient } from "./client";
import type {
  TemporalTag,
  TemporalTagCreate,
  TemporalTagFilter,
  TemporalTagsClient,
  TemporalTagsStatus,
  TemporalTagUpdate,
  UseSampleTemporalTagsOptions,
  UseSampleTemporalTagsResult,
} from "./types";

type TemporalTagsState = {
  readonly error: string | null;
  readonly status: TemporalTagsStatus;
  readonly temporalTags: readonly TemporalTag[];
};

const IDLE_STATE: TemporalTagsState = {
  error: null,
  status: "idle",
  temporalTags: [],
};
let defaultTemporalTagsClient: TemporalTagsClient | undefined;

/**
 * Loads and mutates temporal tags for one dataset sample.
 */
export function useSampleTemporalTags({
  client,
  datasetId,
  filter,
  sampleId,
}: UseSampleTemporalTagsOptions): UseSampleTemporalTagsResult {
  const temporalTagsClient = client ?? getDefaultTemporalTagsClient();
  const filterKey = temporalTagFilterKey(filter);
  const [state, setState] = useState<TemporalTagsState>(IDLE_STATE);
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
        temporalTags: current.temporalTags,
      }));
    }

    try {
      const temporalTags = await temporalTagsClient.listSampleTemporalTags({
        datasetId,
        filter,
        sampleId,
      });
      if (mountedRef.current && requestIdRef.current === requestId) {
        setState({
          error: null,
          status: "ready",
          temporalTags,
        });
      }
      return temporalTags;
    } catch (error) {
      if (mountedRef.current && requestIdRef.current === requestId) {
        setState({
          error: errorMessage(error),
          status: "error",
          temporalTags: [],
        });
      }
      throw error;
    }
    // `filterKey` captures filter content changes while avoiding callback churn
    // when callers pass a new object with the same filter values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId, filterKey, sampleId, temporalTagsClient]);

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
    async (temporalTags: readonly TemporalTagCreate[]) => {
      const ids = requireSampleScope(datasetId, sampleId);
      const created = await temporalTagsClient.createSampleTemporalTags({
        ...ids,
        temporalTags,
      });
      await reload();

      return created;
    },
    [datasetId, reload, sampleId, temporalTagsClient]
  );

  const update = useCallback(
    async (temporalTagId: string, update: TemporalTagUpdate) => {
      const ids = requireSampleScope(datasetId, sampleId);
      const updated = await temporalTagsClient.updateSampleTemporalTag({
        ...ids,
        temporalTagId,
        update,
      });
      await reload();

      return updated;
    },
    [datasetId, reload, sampleId, temporalTagsClient]
  );

  const deleteTags = useCallback(
    async (idsToDelete: readonly string[]) => {
      const ids = requireSampleScope(datasetId, sampleId);
      const deleted = await temporalTagsClient.deleteSampleTemporalTags({
        ...ids,
        ids: idsToDelete,
      });
      await reload();

      return deleted;
    },
    [datasetId, reload, sampleId, temporalTagsClient]
  );

  const clear = useCallback(
    async (clearFilter?: TemporalTagFilter) => {
      const ids = requireSampleScope(datasetId, sampleId);
      const deleted = await temporalTagsClient.clearSampleTemporalTags({
        ...ids,
        filter: clearFilter,
      });
      await reload();

      return deleted;
    },
    [datasetId, reload, sampleId, temporalTagsClient]
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
export function useSampleRendererTemporalTags(
  ctx: SampleRendererProps["ctx"],
  options: {
    readonly client?: TemporalTagsClient;
    readonly filter?: TemporalTagFilter;
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

function temporalTagFilterKey(filter: TemporalTagFilter | undefined) {
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

function getDefaultTemporalTagsClient() {
  defaultTemporalTagsClient ??= createTemporalTagsClient();

  return defaultTemporalTagsClient;
}

import { useCallback, useEffect, useRef, useState } from "react";
import { createTemporalTagsClient } from "./client";
import { invalidateDatasetTemporalTags } from "./dataset-tags";
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

  // A refresh that fails leaves the error in hook state, where `reload` put it.
  // Rejecting here instead would report a completed write as a failure, and the
  // caller would retry it.
  const refresh = useCallback(async () => {
    await reload().catch(() => undefined);
  }, [reload]);

  // Declared before the load effect so the flag is live by the time `reload`
  // first runs. Refs survive a StrictMode effect replay, so the cleanup's
  // `false` would otherwise stick and leave the hook unable to set state.
  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    void reload().catch(() => undefined);
  }, [reload]);

  const create = useCallback(
    async (temporalTags: readonly TemporalTagCreate[]) => {
      const ids = requireSampleScope(datasetId, sampleId);
      const created = await temporalTagsClient.createSampleTemporalTags({
        ...ids,
        temporalTags,
      });
      invalidateDatasetTemporalTags(datasetId, temporalTagsClient);
      await refresh();

      return created;
    },
    [datasetId, refresh, sampleId, temporalTagsClient],
  );

  const update = useCallback(
    async (temporalTagId: string, update: TemporalTagUpdate) => {
      const ids = requireSampleScope(datasetId, sampleId);
      const updated = await temporalTagsClient.updateSampleTemporalTag({
        ...ids,
        temporalTagId,
        update,
      });
      invalidateDatasetTemporalTags(datasetId, temporalTagsClient);
      await refresh();

      return updated;
    },
    [datasetId, refresh, sampleId, temporalTagsClient],
  );

  const deleteTags = useCallback(
    async (idsToDelete: readonly string[]) => {
      const ids = requireSampleScope(datasetId, sampleId);
      const deleted = await temporalTagsClient.deleteSampleTemporalTags({
        ...ids,
        ids: idsToDelete,
      });
      invalidateDatasetTemporalTags(datasetId, temporalTagsClient);
      await refresh();

      return deleted;
    },
    [datasetId, refresh, sampleId, temporalTagsClient],
  );

  const clear = useCallback(
    async (clearFilter?: TemporalTagFilter) => {
      const ids = requireSampleScope(datasetId, sampleId);
      const deleted = await temporalTagsClient.clearSampleTemporalTags({
        ...ids,
        filter: clearFilter,
      });
      invalidateDatasetTemporalTags(datasetId, temporalTagsClient);
      await refresh();

      return deleted;
    },
    [datasetId, refresh, sampleId, temporalTagsClient],
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function requireSampleScope(
  datasetId: string | undefined,
  sampleId: string | undefined,
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

function getDefaultTemporalTagsClient() {
  defaultTemporalTagsClient ??= createTemporalTagsClient();

  return defaultTemporalTagsClient;
}

import { useCallback, useEffect, useRef, useState } from "react";
import { createTemporalTagsClient } from "./client";
import {
  invalidateDatasetTemporalTags,
  setSampleTemporalTags,
} from "./dataset-tags";
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
  const filtered = filter !== undefined;
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

  // After a write: re-list this sample, and hand the dataset's shared store the
  // sample's tags in place of refetching the whole dataset. A filtered hook's
  // list is only part of the sample, so the store gets an unfiltered one.
  //
  // A re-list that fails leaves the error in hook state, where `reload` put it,
  // and falls back to refetching the dataset. Rejecting here instead would
  // report a completed write as a failure, and the caller would retry it.
  const settle = useCallback(async () => {
    try {
      const temporalTags = await reload();
      if (!datasetId || !sampleId) return;

      const sampleTags = filtered
        ? await temporalTagsClient.listSampleTemporalTags({
            datasetId,
            sampleId,
          })
        : temporalTags;
      setSampleTemporalTags(
        datasetId,
        sampleId,
        sampleTags,
        temporalTagsClient,
      );
    } catch {
      invalidateDatasetTemporalTags(datasetId, temporalTagsClient);
    }
  }, [datasetId, filtered, reload, sampleId, temporalTagsClient]);

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
      await settle();

      return created;
    },
    [datasetId, settle, sampleId, temporalTagsClient],
  );

  const update = useCallback(
    async (temporalTagId: string, update: TemporalTagUpdate) => {
      const ids = requireSampleScope(datasetId, sampleId);
      const updated = await temporalTagsClient.updateSampleTemporalTag({
        ...ids,
        temporalTagId,
        update,
      });
      await settle();

      return updated;
    },
    [datasetId, settle, sampleId, temporalTagsClient],
  );

  const deleteTags = useCallback(
    async (idsToDelete: readonly string[]) => {
      const ids = requireSampleScope(datasetId, sampleId);
      const deleted = await temporalTagsClient.deleteSampleTemporalTags({
        ...ids,
        ids: idsToDelete,
      });
      await settle();

      return deleted;
    },
    [datasetId, settle, sampleId, temporalTagsClient],
  );

  const clear = useCallback(
    async (clearFilter?: TemporalTagFilter) => {
      const ids = requireSampleScope(datasetId, sampleId);
      const deleted = await temporalTagsClient.clearSampleTemporalTags({
        ...ids,
        filter: clearFilter,
      });
      await settle();

      return deleted;
    },
    [datasetId, settle, sampleId, temporalTagsClient],
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

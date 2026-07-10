import type { SampleRendererProps } from "@fiftyone/plugins";
import { useCallback, useEffect, useRef, useState } from "react";
import { createDynamicMockProjectionEventsClient } from "./mock";
import type {
  ProjectionEvent,
  ProjectionEventFilter,
  ProjectionEventsClient,
  ProjectionEventsStatus,
  UseEpisodeProjectionEventsOptions,
  UseEpisodeProjectionEventsResult,
} from "./types";

type ProjectionEventsState = {
  readonly error: string | null;
  readonly status: ProjectionEventsStatus;
  readonly events: readonly ProjectionEvent[];
};

const IDLE_STATE: ProjectionEventsState = {
  error: null,
  status: "idle",
  events: [],
};

let defaultProjectionEventsClient: ProjectionEventsClient | undefined;

/**
 * Loads projection events for one episode. Read-only: events are
 * read-only for M1, so there is no create/update/delete.
 */
export function useEpisodeProjectionEvents({
  client,
  datasetId,
  episodeId,
  filter,
}: UseEpisodeProjectionEventsOptions): UseEpisodeProjectionEventsResult {
  const eventsClient = client ?? getDefaultProjectionEventsClient();
  const filterKey = projectionEventFilterKey(filter);
  const [state, setState] = useState<ProjectionEventsState>(IDLE_STATE);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  const reload = useCallback(async () => {
    if (!datasetId || !episodeId) {
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
        events: current.events,
      }));
    }

    try {
      const events = await eventsClient.listEpisodeProjectionEvents({
        datasetId,
        episodeId,
        filter,
      });
      if (mountedRef.current && requestIdRef.current === requestId) {
        setState({ error: null, status: "ready", events });
      }
      return events;
    } catch (error) {
      if (mountedRef.current && requestIdRef.current === requestId) {
        setState({ error: errorMessage(error), status: "error", events: [] });
      }
      throw error;
    }
    // `filterKey` captures filter content changes while avoiding callback churn
    // when callers pass a new object with the same filter values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId, episodeId, filterKey, eventsClient]);

  useEffect(() => {
    void reload().catch(() => undefined);
  }, [reload]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  return { ...state, reload };
}

/**
 * Loads projection events for a sample renderer context. The episode id
 * is the sample id — the events-grain ingestion stamps
 * `episode_id = str(sample_id)` on every row.
 */
export function useSampleRendererProjectionEvents(
  ctx: SampleRendererProps["ctx"],
  options: {
    readonly client?: ProjectionEventsClient;
    readonly filter?: ProjectionEventFilter;
  } = {},
): UseEpisodeProjectionEventsResult {
  return useEpisodeProjectionEvents({
    client: options.client,
    datasetId: ctx.dataset.datasetId,
    episodeId: ctx.sample.sample._id,
    filter: options.filter,
  });
}

function projectionEventFilterKey(filter: ProjectionEventFilter | undefined) {
  if (!filter) {
    return "";
  }

  return JSON.stringify(filter, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value,
  );
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

/**
 * Default client. Uses the in-memory mock until the events-grain resolver
 * and FO-app route are built; swap to `createProjectionEventsClient()`
 * (from `./client`) once that endpoint lands.
 */
function getDefaultProjectionEventsClient() {
  // Dynamic mock: each sample gets a distinct, stable set of events so the
  // demo doesn't show identical projection events on every sample.
  defaultProjectionEventsClient ??= createDynamicMockProjectionEventsClient();

  return defaultProjectionEventsClient;
}

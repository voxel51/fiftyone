import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchMcapTimeline } from "./api";
import type { FetchMcapTimelineParams, McapTimelineResponse } from "./types";

function normalizeError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

type UseMcapTimelineIndexResult = {
  data: McapTimelineResponse | null;
  timeline: McapTimelineResponse["timeline"] | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<McapTimelineResponse | null>;
  reset: () => void;
};

/** Loads and tracks the MCAP timeline index for the requested streams. */
export function useMcapTimelineIndex(
  params: FetchMcapTimelineParams | null | undefined
): UseMcapTimelineIndexResult {
  const streamIdsKey = useMemo(() => {
    return params?.request?.streamIds?.join("\n") ?? "";
  }, [params?.request?.streamIds]);

  const resolvedParams = useMemo(() => {
    if (
      !params?.datasetId ||
      !params?.sampleId ||
      !params?.request?.mediaField
    ) {
      return null;
    }

    return params;
  }, [
    params?.datasetId,
    params?.request?.mediaField,
    params?.sampleId,
    streamIdsKey,
  ]);

  const [data, setData] = useState<McapTimelineResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setIsLoading(false);
  }, []);

  const refetch = useCallback(async () => {
    if (!resolvedParams) {
      reset();
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetchMcapTimeline(resolvedParams);
      setData(response);
      return response;
    } catch (fetchError) {
      const normalizedError = normalizeError(fetchError);
      setData(null);
      setError(normalizedError);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [reset, resolvedParams]);

  useEffect(() => {
    if (!resolvedParams) {
      reset();
      return;
    }

    let isCurrent = true;

    setData(null);
    setError(null);
    setIsLoading(true);

    fetchMcapTimeline(resolvedParams)
      .then((response) => {
        if (!isCurrent) {
          return;
        }

        setData(response);
      })
      .catch((fetchError) => {
        if (!isCurrent) {
          return;
        }

        setData(null);
        setError(normalizeError(fetchError));
      })
      .finally(() => {
        if (!isCurrent) {
          return;
        }

        setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [reset, resolvedParams]);

  return {
    data,
    timeline: data?.timeline ?? null,
    isLoading,
    error,
    refetch,
    reset,
  };
}

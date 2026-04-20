import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchMultimodalTimeline } from "./api";
import type {
  FetchMultimodalTimelineParams,
  MultimodalTimelineIndexResponse,
} from "./types";

function normalizeError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

type UseMultimodalTimelineIndexResult = {
  data: MultimodalTimelineIndexResponse | null;
  timeline: MultimodalTimelineIndexResponse | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<MultimodalTimelineIndexResponse | null>;
  reset: () => void;
};

export function useMultimodalTimelineIndex(
  params: FetchMultimodalTimelineParams | null | undefined
): UseMultimodalTimelineIndexResult {
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
    params?.request?.fallback,
    params?.sampleId,
    streamIdsKey,
    params?.request?.timestampSource,
  ]);

  const [data, setData] = useState<MultimodalTimelineIndexResponse | null>(
    null
  );
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
      const response = await fetchMultimodalTimeline(resolvedParams);
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

    fetchMultimodalTimeline(resolvedParams)
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
    timeline: data,
    isLoading,
    error,
    refetch,
    reset,
  };
}

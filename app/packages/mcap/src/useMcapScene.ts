import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchMcapScene } from "./api";
import type { FetchMcapSceneParams, McapSceneOpenResponse } from "./types";

function normalizeError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

type UseMcapSceneResult = {
  data: McapSceneOpenResponse | null;
  scene: McapSceneOpenResponse["scene"] | null;
  playbackPlan: McapSceneOpenResponse["playbackPlan"] | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<McapSceneOpenResponse | null>;
  reset: () => void;
};

/** Loads and tracks the scene-open payload for the active MCAP sample. */
export function useMcapScene(
  params: FetchMcapSceneParams | null | undefined
): UseMcapSceneResult {
  const resolvedParams = useMemo(() => {
    if (!params?.datasetId || !params?.sampleId || !params?.mediaField) {
      return null;
    }

    return params;
  }, [params?.datasetId, params?.mediaField, params?.sampleId]);

  const [data, setData] = useState<McapSceneOpenResponse | null>(null);
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
      const response = await fetchMcapScene(resolvedParams);
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

    fetchMcapScene(resolvedParams)
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
    scene: data?.scene ?? null,
    playbackPlan: data?.playbackPlan ?? null,
    isLoading,
    error,
    refetch,
    reset,
  };
}

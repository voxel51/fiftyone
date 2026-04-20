import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchMultimodalWorkspace } from "./api";
import type {
  FetchMultimodalWorkspaceParams,
  MultimodalCatalog,
  MultimodalRenderingPlan,
  MultimodalWorkspaceResponse,
} from "./types";

function normalizeError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

function markPerformance(name: string) {
  if (typeof performance === "undefined" || !performance.mark) {
    return;
  }

  performance.mark(name);
}

function measurePerformance(name: string, startMark: string, endMark: string) {
  if (typeof performance === "undefined" || !performance.measure) {
    return;
  }

  try {
    performance.measure(name, startMark, endMark);
  } catch {
    // no-op in tests or partial boot flows
  }
}

type UseMultimodalWorkspaceResult = {
  data: MultimodalWorkspaceResponse | null;
  catalog: MultimodalCatalog | null;
  renderingPlan: MultimodalRenderingPlan | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<MultimodalWorkspaceResponse | null>;
  reset: () => void;
};

export function useMultimodalWorkspace(
  params: FetchMultimodalWorkspaceParams | null | undefined
): UseMultimodalWorkspaceResult {
  const resolvedParams = useMemo(() => {
    if (!params?.datasetId || !params?.sampleId || !params?.mediaField) {
      return null;
    }

    return params;
  }, [params?.datasetId, params?.mediaField, params?.sampleId]);

  const [data, setData] = useState<MultimodalWorkspaceResponse | null>(null);
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
      const response = await fetchMultimodalWorkspace(resolvedParams);
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
    markPerformance("multimodal:workspace-fetch:start");

    fetchMultimodalWorkspace(resolvedParams)
      .then((response) => {
        if (!isCurrent) {
          return;
        }

        setData(response);
        markPerformance("multimodal:workspace-fetch:end");
        measurePerformance(
          "multimodal:workspace-fetch",
          "multimodal:workspace-fetch:start",
          "multimodal:workspace-fetch:end"
        );
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
    catalog: data?.catalog ?? null,
    renderingPlan: data?.renderingPlan ?? null,
    isLoading,
    error,
    refetch,
    reset,
  };
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchMultimodalWorkspace, saveMultimodalWorkspace } from "./api";
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
  isSaving: boolean;
  error: Error | null;
  saveError: Error | null;
  refetch: () => Promise<MultimodalWorkspaceResponse | null>;
  save: (
    renderingPlan: MultimodalRenderingPlan
  ) => Promise<MultimodalRenderingPlan | null>;
  clearSaveError: () => void;
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
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [saveError, setSaveError] = useState<Error | null>(null);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setIsLoading(false);
    setIsSaving(false);
    setSaveError(null);
  }, []);

  const clearSaveError = useCallback(() => {
    setSaveError(null);
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

  const save = useCallback(
    async (renderingPlan: MultimodalRenderingPlan) => {
      if (!resolvedParams) {
        const saveParamsError = new Error(
          "Workspace parameters are not available"
        );
        setSaveError(saveParamsError);
        return null;
      }

      setIsSaving(true);
      setSaveError(null);

      try {
        const savedRenderingPlan = await saveMultimodalWorkspace({
          datasetId: resolvedParams.datasetId,
          sampleId: resolvedParams.sampleId,
          renderingPlan,
        });

        setData((current) =>
          current
            ? {
                ...current,
                renderingPlan: savedRenderingPlan,
              }
            : current
        );

        return savedRenderingPlan;
      } catch (saveWorkspaceError) {
        const normalizedError = normalizeError(saveWorkspaceError);
        setSaveError(normalizedError);
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [resolvedParams]
  );

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
    isSaving,
    error,
    saveError,
    refetch,
    save,
    clearSaveError,
    reset,
  };
}

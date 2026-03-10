import * as fos from "@fiftyone/state";
import { getFetchFunction } from "@fiftyone/utilities";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRecoilValue } from "recoil";

type StaticTransformsListResponse = {
  transforms: unknown[];
};

export const useFetchSampleStaticTransform = () => {
  const datasetId = useRecoilValue(fos.datasetId);
  const sampleId = useRecoilValue(fos.currentSampleId);

  const listCacheRef = useRef<unknown[] | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // This effect resets cache and loading state when dataset or sample changes.
  useEffect(() => {
    listCacheRef.current = null;
    setIsLoading(false);
    setError(null);
  }, [datasetId, sampleId]);

  const clearCache = useCallback(() => {
    listCacheRef.current = null;
  }, []);

  const fetchAvailableStaticTransforms = useCallback(async (): Promise<
    unknown[]
  > => {
    if (!datasetId || !sampleId) {
      return [];
    }

    if (listCacheRef.current !== null) {
      return listCacheRef.current;
    }

    const fetch = getFetchFunction({ cache: true });
    if (!fetch) {
      const fetchError = new Error("Fetch function not initialized");
      setError(fetchError);
      return [];
    }

    setIsLoading(true);
    setError(null);

    const fetchDatasetId = datasetId;
    const fetchSampleId = sampleId;

    try {
      const response = await fetch<void, StaticTransformsListResponse>(
        "GET",
        `/dataset/${encodeURIComponent(
          fetchDatasetId
        )}/sample/${encodeURIComponent(fetchSampleId)}/static_transforms`
      );

      const transforms = Array.isArray(response?.transforms)
        ? response.transforms
        : [];

      if (datasetId === fetchDatasetId && sampleId === fetchSampleId) {
        listCacheRef.current = transforms;
      }
      return transforms;
    } catch (fetchError) {
      const normalizedError =
        fetchError instanceof Error
          ? fetchError
          : new Error(String(fetchError));

      if (datasetId === fetchDatasetId && sampleId === fetchSampleId) {
        setError(normalizedError);
      }
      return [];
    } finally {
      if (datasetId === fetchDatasetId && sampleId === fetchSampleId) {
        setIsLoading(false);
      }
    }
  }, [datasetId, sampleId]);

  return {
    fetchAvailableStaticTransforms,
    clearCache,
    isLoading,
    error,
  };
};

import * as fos from "@fiftyone/state";
import { getFetchFunction } from "@fiftyone/utilities";
import { useCallback, useEffect, useState } from "react";
import { useRecoilValue } from "recoil";
import { useImageSlicesIfAvailable } from "../../../annotation/useImageSlicesIfAvailable";
import type {
  CameraIntrinsics,
  FrustumData,
  GroupIntrinsicsResponse,
  GroupStaticTransformResponse,
  StaticTransform,
} from "../../types";

/**
 * Loads an image and returns its dimensions.
 */
function loadImageDimensions(
  url: string
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      reject(new Error(`Failed to load image: ${url}`));
    };
    img.src = url;
  });
}

/**
 * Fetches camera frustum data (static transforms and intrinsics) for all 2D slices
 * in a grouped dataset.
 *
 * @returns FrustumData for all non-3D slices with valid static transforms
 */
export function useFetchFrustumParameters() {
  const [data, setData] = useState<FrustumData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [fetchTrigger, setFetchTrigger] = useState(0);

  const datasetId = useRecoilValue(fos.datasetId);
  const sampleId = useRecoilValue(fos.currentSampleId);
  const isGroup = useRecoilValue(fos.isGroup);
  const currentFo3dSlice = useRecoilValue(fos.fo3dSlice);
  const allNon3dSlices = useRecoilValue(fos.allNon3dSlices);
  const modalSample = useRecoilValue(fos.modalSample);

  const { resolveUrlForImageSlice, isLoadingImageSlices } =
    useImageSlicesIfAvailable(modalSample);

  const refetch = useCallback(() => {
    setFetchTrigger((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (!isGroup || !datasetId || !sampleId || allNon3dSlices.length === 0) {
      setData([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const fetch = getFetchFunction();
        if (!fetch) {
          throw new Error("Fetch function not initialized");
        }

        // Fetch both static transforms and intrinsics in parallel
        const [staticTransformResponse, intrinsicsResponse] = await Promise.all(
          [
            fetch<void, GroupStaticTransformResponse>(
              "GET",
              `/dataset/${encodeURIComponent(
                datasetId
              )}/sample/${encodeURIComponent(sampleId)}/group/static_transforms`
            ),
            fetch<void, GroupIntrinsicsResponse>(
              "GET",
              `/dataset/${encodeURIComponent(
                datasetId
              )}/sample/${encodeURIComponent(sampleId)}/group/intrinsics`
            ),
          ]
        );

        // Build frustum data for each non-3D slice
        const frustums: FrustumData[] = [];

        for (const sliceName of allNon3dSlices) {
          if (sliceName === currentFo3dSlice) {
            continue;
          }

          const staticTransformResult =
            staticTransformResponse.results[sliceName];
          const intrinsicsResult = intrinsicsResponse.results[sliceName];

          if (staticTransformResult && "error" in staticTransformResult) {
            frustums.push({
              sliceName,
              staticTransform: null,
              intrinsics: null,
              hasError: true,
              errorMessage: staticTransformResult.error,
            });
            continue;
          }

          const staticTransform =
            staticTransformResult && "staticTransform" in staticTransformResult
              ? (staticTransformResult.staticTransform as StaticTransform | null)
              : null;

          if (!staticTransform) {
            continue;
          }

          let intrinsics: CameraIntrinsics | null = null;
          if (intrinsicsResult && "intrinsics" in intrinsicsResult) {
            intrinsics = intrinsicsResult.intrinsics as CameraIntrinsics | null;
          }

          const imageUrl = resolveUrlForImageSlice(sliceName) ?? undefined;

          frustums.push({
            sliceName,
            staticTransform,
            intrinsics,
            imageUrl,
          });
        }

        if (cancelled) return;

        // Load image dimensions in parallel to get aspect ratios
        const frustumsWithAspectRatios = await Promise.all(
          frustums.map(async (frustum) => {
            if (!frustum.imageUrl) {
              return frustum;
            }

            try {
              const { width, height } = await loadImageDimensions(
                frustum.imageUrl
              );
              return {
                ...frustum,
                imageAspectRatio: width / height,
              };
            } catch {
              return frustum;
            }
          })
        );

        if (!cancelled) {
          setData(frustumsWithAspectRatios);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to fetch frustum data:", err);
          setError(err instanceof Error ? err : new Error(String(err)));
          setData([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [
    isGroup,
    datasetId,
    sampleId,
    currentFo3dSlice,
    allNon3dSlices,
    resolveUrlForImageSlice,
    fetchTrigger,
  ]);

  return {
    data,
    isLoading: isLoading || isLoadingImageSlices,
    error,
    refetch,
  };
}

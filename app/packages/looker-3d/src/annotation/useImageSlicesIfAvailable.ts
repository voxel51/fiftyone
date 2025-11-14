import {
  ModalSample,
  datasetId,
  getSampleSrc as resolveUrl,
} from "@fiftyone/state";
import { getFetchFunction } from "@fiftyone/utilities";
import { useCallback, useEffect, useState } from "react";
import { useRecoilValue } from "recoil";

type GroupResponse = {
  group: Record<string, any>;
  urls?: Record<string, string>;
};

/**
 * Hook that fetches and returns available image slices for group samples.
 *
 * @param sample - The modal sample to check for image slices
 * @returns An object containing:
 *   - `imageSlices`: Array of image slice names available for the group sample
 *   - `resolveUrlForImageSlice`: Function that takes a slice name and returns its URL, or null if not found
 *   - `isLoadingImageSlices`: Boolean indicating whether the image slices are currently being fetched
 */
export const useImageSlicesIfAvailable = (
  sample: ModalSample
): {
  imageSlices: string[];
  resolveUrlForImageSlice: (sliceName: string) => string | null;
  isLoadingImageSlices: boolean;
} => {
  const [isLoadingImageSlices, setIsLoadingImageSlices] = useState(false);
  const [imageSlices, setImageSlices] = useState<string[]>([]);
  const [sliceUrls, setSliceUrls] = useState<Record<string, string>>({});
  const dataset = useRecoilValue(datasetId);

  const hasGroup = Boolean(sample?.sample?.group?._id);
  const groupId = sample?.sample?.group?._id;

  useEffect(() => {
    if (!hasGroup || !groupId || !dataset) {
      setIsLoadingImageSlices(false);
      setImageSlices([]);
      setSliceUrls({});
      return;
    }

    let cancelled = false;

    const fetchImageSlices = async () => {
      try {
        setIsLoadingImageSlices(true);
        const fetchFunction = getFetchFunction();
        const path = `/dataset/${dataset}/groups/${groupId}?fields=filepath&resolve_urls=true&media_type=image`;

        const response = await fetchFunction("GET", path);

        if (cancelled) return;

        const data = response as GroupResponse;

        if (!data.group) {
          setImageSlices([]);
          setSliceUrls({});
          return;
        }

        const imageSliceNames: string[] = [];
        const urls: Record<string, string> = {};

        for (const [sliceName, sliceData] of Object.entries(data.group)) {
          const filepath = sliceData.filepath;

          imageSliceNames.push(sliceName);

          // Get the URL for this slice from the urls response
          // The key format is "{sliceName}.filepath"
          const urlKey = `${sliceName}.filepath`;
          if (data.urls && data.urls[urlKey]) {
            urls[sliceName] = resolveUrl(data.urls[urlKey]);
          } else if (filepath) {
            // Fallback to filepath if URL not in response
            urls[sliceName] = resolveUrl(filepath);
          }
        }

        setImageSlices(imageSliceNames);
        setSliceUrls(urls);
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to fetch image slices:", error);
          setImageSlices([]);
          setSliceUrls({});
        }
      } finally {
        if (!cancelled) {
          setIsLoadingImageSlices(false);
        }
      }
    };

    fetchImageSlices();

    return () => {
      cancelled = true;
    };
  }, [hasGroup, groupId, dataset]);

  const resolveUrlForImageSlice = useCallback(
    (sliceName: string): string | null => {
      return sliceUrls[sliceName] || null;
    },
    [sliceUrls]
  );

  if (!hasGroup) {
    return {
      imageSlices: [],
      resolveUrlForImageSlice: () => null,
      isLoadingImageSlices: false,
    };
  }

  return {
    imageSlices,
    resolveUrlForImageSlice,
    isLoadingImageSlices,
  };
};

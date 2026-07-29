import {
  ModalSample,
  State,
  datasetId,
  fieldPaths,
  getSampleSrc as resolveUrl,
} from "@fiftyone/state";
import {
  DETECTIONS_FIELD,
  DETECTION_FIELD,
  EMBEDDED_DOCUMENT_FIELD,
  POLYLINES_FIELD,
  POLYLINE_FIELD,
  getFetchFunction,
} from "@fiftyone/utilities";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRecoilValue } from "recoil";
import { extractNative2dLabels } from "./native2d/parse";
import type { Native2dLabel } from "./native2d/types";

type GroupResponse = {
  group: Record<string, any>;
  urls?: Record<string, string>;
};

/**
 * Hook that fetches and returns available image slices for group samples.
 *
 * @param sample - The modal sample to check for image slices, or `undefined`
 *   while the sample is still loading
 * @returns An object containing:
 *   - `imageSlices`: Array of image slice names available for the group sample
 *   - `resolveUrlForImageSlice`: Function that takes a slice name and returns its URL, or null if not found
 *   - `isLoadingImageSlices`: Boolean indicating whether the image slices are currently being fetched
 */
export const useImageSlicesIfAvailable = (
  sample: ModalSample | undefined,
): {
  imageSlices: string[];
  resolveUrlForImageSlice: (sliceName: string) => string | null;
  resolveLabelsForImageSlice: (sliceName: string) => Native2dLabel[];
  isLoadingImageSlices: boolean;
} => {
  const [isLoadingImageSlices, setIsLoadingImageSlices] = useState(false);
  const [imageSlices, setImageSlices] = useState<string[]>([]);
  const [sliceUrls, setSliceUrls] = useState<Record<string, string>>({});
  const [sliceLabels, setSliceLabels] = useState<
    Record<string, Native2dLabel[]>
  >({});
  const dataset = useRecoilValue(datasetId);

  // Sample-level Detection(s)/Polyline(s) fields — the 2D labels we render on
  // the camera slices. Excludes heavier label types (masks, heatmaps).
  const labelFieldPaths = useRecoilValue(
    fieldPaths({
      space: State.SPACE.SAMPLE,
      ftype: EMBEDDED_DOCUMENT_FIELD,
      embeddedDocType: [
        DETECTION_FIELD,
        DETECTIONS_FIELD,
        POLYLINE_FIELD,
        POLYLINES_FIELD,
      ],
    })
  );
  const labelFieldsKey = labelFieldPaths.join(",");

  const hasGroup = Boolean(sample?.sample?.group?._id);
  const groupId = sample?.sample?.group?._id;

  useEffect(() => {
    if (!hasGroup || !groupId || !dataset) {
      setIsLoadingImageSlices(false);
      setImageSlices([]);
      setSliceUrls({});
      setSliceLabels({});
      return undefined;
    }

    let cancelled = false;

    const fetchImageSlices = async () => {
      try {
        setIsLoadingImageSlices(true);

        const fetchFunction = getFetchFunction({ cache: true });
        // Request filepath (for the image URL) plus the 2D label fields so we
        // can draw the slice's own Detection(s)/Polyline(s) overlays.
        const fields = ["filepath", ...labelFieldPaths].join(",");
        const path = `/dataset/${dataset}/groups/${groupId}?fields=${encodeURIComponent(
          fields
        )}&resolve_urls=true&media_type=image`;

        const response = await fetchFunction("GET", path);

        if (cancelled) return;

        const data = response as GroupResponse;

        if (!data.group) {
          setImageSlices([]);
          setSliceUrls({});
          setSliceLabels({});
          return;
        }

        const imageSliceNames: string[] = [];
        const urls: Record<string, string> = {};
        const labels: Record<string, Native2dLabel[]> = {};

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

          labels[sliceName] = extractNative2dLabels(sliceData, labelFieldPaths);
        }

        setImageSlices(imageSliceNames);
        setSliceUrls(urls);
        setSliceLabels(labels);
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to fetch image slices:", error);
          setImageSlices([]);
          setSliceUrls({});
          setSliceLabels({});
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasGroup, groupId, dataset, labelFieldsKey]);

  const resolveUrlForImageSlice = useCallback(
    (sliceName: string): string | null => {
      return sliceUrls[sliceName] || null;
    },
    [sliceUrls],
  );

  const emptyLabels = useMemo<Native2dLabel[]>(() => [], []);
  const resolveLabelsForImageSlice = useCallback(
    (sliceName: string): Native2dLabel[] => {
      return sliceLabels[sliceName] ?? emptyLabels;
    },
    [sliceLabels, emptyLabels],
  );

  if (!hasGroup) {
    return {
      imageSlices: [],
      resolveUrlForImageSlice: () => null,
      resolveLabelsForImageSlice: () => emptyLabels,
      isLoadingImageSlices: false,
    };
  }

  return {
    imageSlices,
    resolveUrlForImageSlice,
    resolveLabelsForImageSlice,
    isLoadingImageSlices,
  };
};

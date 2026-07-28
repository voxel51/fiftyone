import { currentSlice, groupMediaTypesMap, isGroup } from "@fiftyone/state";
import { useSetAtom } from "jotai";
import { useEffect } from "react";
import { useRecoilValue } from "recoil";
import { annotationSliceMediaType } from "./state";

/**
 * Bridge the media type of the slice currently open in the modal into the Jotai
 * `annotationSliceMediaType` atom, so `visibleLabelSchemas` can narrow the
 * dataset-wide schema to what the open slice supports (a grouped dataset's
 * active schema is a superset across slices). Writes null for a non-grouped
 * dataset — no per-slice filtering then. Recoil can't be read from inside a
 * Jotai getter, hence this mirror (same pattern as exploreActiveFields).
 *
 * Mount once at the annotation root.
 */
export const useSyncAnnotationSliceMediaType = (): void => {
  const grouped = useRecoilValue(isGroup);
  const slice = useRecoilValue(currentSlice(true));
  const mediaTypes = useRecoilValue(groupMediaTypesMap);
  const setSliceMediaType = useSetAtom(annotationSliceMediaType);

  useEffect(() => {
    if (!grouped || !slice) {
      setSliceMediaType(null);
      return;
    }

    setSliceMediaType(mediaTypes[slice] ?? null);
  }, [grouped, slice, mediaTypes, setSliceMediaType]);
};

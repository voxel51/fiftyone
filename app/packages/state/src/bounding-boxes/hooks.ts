import { useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { useCurrentDatasetId } from "../accessors/dataset";
import { hiddenBoundingBoxesAtom } from "./model/atoms";

const useHiddenBoundingBoxesAtom = () =>
  hiddenBoundingBoxesAtom(useCurrentDatasetId() ?? "");

/**
 * Whether a detection field's box outlines are shown in looker overlays.
 *
 * @param labelPath - the detection field's sidebar path, e.g. "ground_truth"
 *   or "frames.ground_truth"
 */
export const useBoundingBoxVisibility = (labelPath: string): boolean =>
  !useAtomValue(useHiddenBoundingBoxesAtom()).includes(labelPath);

/**
 * Shows or hides a detection field's box outlines in looker overlays.
 *
 * @param labelPath - the detection field's sidebar path, e.g. "ground_truth"
 *   or "frames.ground_truth"
 */
export const useToggleBoundingBoxVisibility = (labelPath: string) => {
  const setHidden = useSetAtom(useHiddenBoundingBoxesAtom());

  return useCallback(() => {
    setHidden((current) =>
      current.includes(labelPath)
        ? current.filter((path) => path !== labelPath)
        : [...current, labelPath],
    );
  }, [labelPath, setHidden]);
};

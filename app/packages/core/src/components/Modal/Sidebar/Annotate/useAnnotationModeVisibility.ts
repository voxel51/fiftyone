import * as fos from "@fiftyone/state";
import {
  ANNOTATE,
  EXPLORE,
  explorerVisibilitySnapshotAtom,
  GroupVisibilityConfigSnapshot,
  modalMode,
} from "@fiftyone/state";
import { useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import { useRecoilState } from "recoil";

interface UseAnnotationModeVisibilityOptions {
  isGroupedDataset: boolean;
  disabledReason: string | null;
}

/**
 * Hook that manages visibility settings when transitioning between
 * Explore and Annotate modes for grouped datasets.
 *
 * - Captures visibility settings when entering Annotate mode
 * - Restores visibility settings when returning to Explore mode
 */
export function useAnnotationModeVisibility({
  isGroupedDataset,
  disabledReason,
}: UseAnnotationModeVisibilityOptions) {
  const mode = useAtomValue(modalMode);
  const [modalGroupSliceValue, setModalGroupSliceValue] = useRecoilState(
    fos.modalGroupSlice
  );

  const [mainVisible, setMainVisible] = useRecoilState(
    fos.groupMediaIsMainVisibleSetting
  );
  const [carouselVisible, setCarouselVisible] = useRecoilState(
    fos.groupMediaIsCarouselVisibleSetting
  );
  const [threeDVisible, setThreeDVisible] = useRecoilState(
    fos.groupMedia3dVisibleSetting
  );

  const [visibilitySnapshot, setVisibilitySnapshot] = useAtom(
    explorerVisibilitySnapshotAtom
  );

  // Track the previous mode for detecting transitions
  const prevModeRef = useRef(mode);

  const captureVisibility = useCallback((): GroupVisibilityConfigSnapshot => {
    return {
      main: mainVisible,
      carousel: carouselVisible,
      threeDViewer: threeDVisible,
      slice: modalGroupSliceValue,
    };
  }, [mainVisible, carouselVisible, threeDVisible, modalGroupSliceValue]);

  const restoreVisibility = useCallback(
    (snapshot: GroupVisibilityConfigSnapshot | null) => {
      if (!snapshot) return;
      setMainVisible(snapshot.main);
      setCarouselVisible(snapshot.carousel);
      setThreeDVisible(snapshot.threeDViewer);
      if (snapshot.slice !== undefined) {
        setModalGroupSliceValue(snapshot.slice);
      }
    },
    []
  );

  // This effects handles mode transitions
  useEffect(() => {
    const prevMode = prevModeRef.current;

    if (isGroupedDataset && !disabledReason) {
      if (prevMode === EXPLORE && mode === ANNOTATE) {
        // Entering Annotate mode: capture current visibility
        setVisibilitySnapshot(captureVisibility());
      } else if (prevMode === ANNOTATE && mode === EXPLORE) {
        // Returning to Explore mode: restore visibility
        restoreVisibility(visibilitySnapshot);
        setVisibilitySnapshot(null);
      }
    }

    prevModeRef.current = mode;
  }, [
    mode,
    isGroupedDataset,
    disabledReason,
    captureVisibility,
    restoreVisibility,
    visibilitySnapshot,
  ]);
}

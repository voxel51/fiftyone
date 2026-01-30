import * as fos from "@fiftyone/state";
import {
  GroupVisibilityConfigSnapshot,
  ModalMode,
  useModalMode,
} from "@fiftyone/state";
import { useCallback, useEffect, useRef } from "react";
import { useRecoilState } from "recoil";

/**
 * Hook that manages visibility settings when transitioning between
 * Explore and Annotate modes for grouped datasets.
 *
 * - Captures visibility settings when entering Annotate mode
 * - Restores visibility settings when returning to Explore mode
 */
export function useGroupAnnotationModeController() {
  const mode = useModalMode();
  const [modalGroupSliceValue, setModalGroupSliceValue] = useRecoilState(
    fos.modalGroupSlice
  );

  const [mainVisible, setMainVisible] = useRecoilState(
    fos.groupMediaIsMain2DViewerVisibleSetting
  );
  const [carouselVisible, setCarouselVisible] = useRecoilState(
    fos.groupMediaIsCarouselVisibleSetting
  );
  const [threeDVisible, setThreeDVisible] = useRecoilState(
    fos.groupMedia3dVisibleSetting
  );

  // Track the previous mode for detecting transitions
  const prevModeRef = useRef(mode);

  const visibilitySnapshotRef = useRef<GroupVisibilityConfigSnapshot | null>(
    null
  );

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

  // This effect handles mode transitions
  useEffect(() => {
    const prevMode = prevModeRef.current;

    if (prevMode === ModalMode.EXPLORE && mode === ModalMode.ANNOTATE) {
      // Entering Annotate mode: capture current visibility
      visibilitySnapshotRef.current = captureVisibility();
    } else if (prevMode === ModalMode.ANNOTATE && mode === ModalMode.EXPLORE) {
      // Returning to Explore mode: restore visibility
      restoreVisibility(visibilitySnapshotRef.current);
      visibilitySnapshotRef.current = null;
    }

    prevModeRef.current = mode;
  }, [mode, captureVisibility, restoreVisibility]);
}

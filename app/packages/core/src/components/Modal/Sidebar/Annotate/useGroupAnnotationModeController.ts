import * as fos from "@fiftyone/state";
import {
  GroupVisibilityConfigSnapshot,
  ModalMode,
  useModalMode,
} from "@fiftyone/state";
import { useCallback, useEffect, useRef } from "react";
import {
  useRecoilCallback,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";
import { useApplyAnnotationSliceVisibility } from "./useApplyAnnotationSliceVisibility";
import { useGroupAnnotationSlices } from "./useGroupAnnotationSlices";

const useApplySlice = () => {
  const { request } = useGroupAnnotationSlices();
  const modalGroupSlice = useRecoilValue(fos.modalGroupSlice);
  const [preferredSlice, setPreferredSlice] =
    fos.usePreferredGroupAnnotationSlice();

  const resolveSlice = useRecoilCallback(
    () => async () => {
      const allSlices = await request();
      const available = allSlices
        .filter(({ isMissing, isSupported }) => isSupported && !isMissing)
        .map(({ name }) => name);

      if (preferredSlice && available.includes(preferredSlice)) {
        return preferredSlice;
      }

      if (modalGroupSlice && available.includes(modalGroupSlice)) {
        return modalGroupSlice;
      }

      return available.length > 0 ? available[0] : null;
    },
    [modalGroupSlice, preferredSlice, request],
  );

  const setModalGroupSlice = useSetRecoilState(fos.modalGroupSlice);
  const applyVisibilityForSlice = useApplyAnnotationSliceVisibility();
  return useCallback(async () => {
    const slice = await resolveSlice();

    setPreferredSlice(slice);
    setModalGroupSlice(slice);
    applyVisibilityForSlice(slice);
  }, [
    applyVisibilityForSlice,
    resolveSlice,
    setModalGroupSlice,
    setPreferredSlice,
  ]);
};

/**
 * Hook that manages visibility settings when transitioning between
 * Explore and Annotate modes for group datasets.
 *
 * - Captures visibility settings when entering Annotate mode
 * - Restores visibility settings when returning to Explore mode
 */
export function useGroupAnnotationModeController() {
  const mode = useModalMode();
  const threeDVisible = fos.useIs3dVisibleSetting();
  const { setVisible } = fos.useRenderConfig3dActions();
  const [modalGroupSliceValue, setModalGroupSliceValue] = useRecoilState(
    fos.modalGroupSlice,
  );

  const [mainVisible, setMainVisible] = useRecoilState(
    fos.groupMediaIsMain2DViewerVisibleSetting,
  );
  const [carouselVisible, setCarouselVisible] = useRecoilState(
    fos.groupMediaIsCarouselVisibleSetting,
  );
  // Always initialize to EXPLORE so that a modal opening directly in ANNOTATE
  // mode (e.g. after close/reopen with modalMode persisted) is treated as an
  // EXPLORE → ANNOTATE transition.
  const prevModeRef = useRef(ModalMode.EXPLORE);

  const visibilitySnapshotRef = useRef<GroupVisibilityConfigSnapshot | null>(
    null,
  );

  const applySlice = useApplySlice();
  const captureVisibility = useCallback((): GroupVisibilityConfigSnapshot => {
    applySlice();
    return {
      main: mainVisible,
      carousel: carouselVisible,
      threeDViewer: threeDVisible,
      slice: modalGroupSliceValue,
    };
  }, [
    applySlice,
    mainVisible,
    carouselVisible,
    threeDVisible,
    modalGroupSliceValue,
  ]);

  const restoreVisibility = useCallback(
    (snapshot: GroupVisibilityConfigSnapshot | null) => {
      if (!snapshot) return;
      setMainVisible(snapshot.main);
      setCarouselVisible(snapshot.carousel);
      setVisible(snapshot.threeDViewer);
      if (typeof snapshot.slice !== "undefined") {
        setModalGroupSliceValue(snapshot.slice);
      }
    },
    [setCarouselVisible, setMainVisible, setModalGroupSliceValue, setVisible],
  );

  // This effect handles mode transitions
  useEffect(() => {
    const prevMode = prevModeRef.current ?? ModalMode.EXPLORE;

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

export * from "./3d";

import type { Schema } from "@fiftyone/utilities";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo } from "react";
import { useRecoilState, useRecoilValue, useRecoilValueLoadable } from "recoil";
import { ModalMode, modalMode } from "../../jotai";
import { preferredGroupAnnotationSliceAtom } from "../../jotai/group-annotation";
import type { ModalViewportState } from "../../jotai/modal";
import { __unsafeModalViewportAtom } from "../../jotai/modal";
import type { ModalSample } from "../../recoil";
import {
  State,
  activeFields,
  currentSampleId,
  fieldSchema,
  lookerOptions,
  modalSample,
  selectedMediaField,
} from "../../recoil";

/**
 * Hook which provides the modal's current active paths,
 * and a setter to update the paths.
 */
export const useActiveModalFields = () =>
  useRecoilState(activeFields({ modal: true }));

/**
 * Manager which supports switching modal modes.
 */
export interface ModalModeController {
  /**
   * Switch to annotate mode in the modal.
   */
  activateAnnotateMode: () => void;

  /**
   * Switch to explore mode in the modal.
   */
  activateExploreMode: () => void;
}

/**
 * Hook which provides a {@link ModalModeController}.
 */
export const useModalModeController = (): ModalModeController => {
  const setMode = useSetAtom(modalMode);

  const activateAnnotateMode = useCallback(
    () => setMode(ModalMode.ANNOTATE),
    [setMode]
  );
  const activateExploreMode = useCallback(
    () => setMode(ModalMode.EXPLORE),
    [setMode]
  );

  return useMemo(
    () => ({ activateAnnotateMode, activateExploreMode }),
    [activateExploreMode, activateAnnotateMode]
  );
};

/**
 * Get the current modal mode.
 */
export const useModalMode = () => useAtomValue(modalMode);

/**
 * Get the current modal sample data.
 *
 * If the modal is not open, or the sample is being loaded, this hook will
 * return `undefined`.
 */
export const useModalSample = (): ModalSample | undefined => {
  const loadable = useRecoilValueLoadable(modalSample);

  if (loadable.state === "hasValue") {
    return loadable.contents;
  }

  return undefined;
};

/**
 * Get the current modal sample schema.
 */
export const useModalSampleSchema = (): Schema =>
  useRecoilValue(fieldSchema({ space: State.SPACE.SAMPLE }));

/**
 * Hook to retrieve the selected media field for the modal view.
 *
 * @returns The selected media field state for the modal
 */
export const useSelectedMediaFieldModal = () =>
  useRecoilValue(selectedMediaField(true));

/**
 * Get and set the preferred annotation slice for grouped datasets.
 * Returns [preferredSlice, setPreferredSlice].
 */
export const usePreferredGroupAnnotationSlice = () =>
  useAtom(preferredGroupAnnotationSliceAtom);

/**
 * Gets the current sample ID.
 */
export const useCurrentSampleId = () => {
  const loadable = useRecoilValueLoadable(currentSampleId);

  return loadable.state === "hasValue" ? loadable.contents : null;
};

/**
 * Gets the saved modal viewport (zoom/pan) state.
 */
export const useModalViewport = (): ModalViewportState | null =>
  useAtomValue(__unsafeModalViewportAtom);

/**
 * Setter for persisting the modal viewport (zoom/pan) state.
 */
export const useSaveModalViewport = () => useSetAtom(__unsafeModalViewportAtom);

/**
 * Gets the looker options for the modal.
 *
 * @param withFilter - Whether to apply frontend label filtering. Defaults to `false`.
 */
export const useModalLookerOptions = (withFilter = false) => {
  return useRecoilValue(lookerOptions({ modal: true, withFilter }));
};

/**
 * Returns the current media path in the modal.
 */
export const useModalMediaPath = (): string | null => {
  const sample = useModalSample();
  const mediaField = useRecoilValue(selectedMediaField(true));

  if (!sample) {
    return null;
  }

  return Array.isArray(sample.urls)
    ? sample.urls.find((u) => u.field === mediaField)?.url ??
        sample.urls[0]?.url
    : sample.urls[mediaField];
};

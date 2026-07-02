export * from "./3d";
export * from "./dynamicGroups";
export * from "./use-active-modal-sample-value";

import type { Schema } from "@fiftyone/utilities";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo, useRef } from "react";
import {
  useRecoilState,
  useRecoilValue,
  useRecoilValueLoadable,
  useSetRecoilState,
} from "recoil";
import { ModalMode, modalMode } from "../../jotai";
import { preferredGroupAnnotationSliceAtom } from "../../jotai/group-annotation";
import type { ModalViewportState } from "../../jotai/modal";
import { __unsafeModalViewportAtom } from "../../jotai/modal";
import type { ModalSample } from "../../recoil";
import type { Sample } from "@fiftyone/looker";
import {
  State,
  activeFields,
  activeModalSample,
  currentSampleId,
  fieldSchema,
  lookerOptions,
  modalSample,
  selectedLabelMap,
  selectedMediaField,
} from "../../recoil";
import { GroupSampleNotFound } from "../../recoil/modal";

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
  const clearSelectedLabels = useSetRecoilState(selectedLabelMap);

<<<<<<< HEAD
  const activateAnnotateMode = useCallback(
    () => setMode(ModalMode.ANNOTATE),
    [setMode],
  );
=======
  // Explore's 3D selection has no deselect affordance in Annotate, so clear it
  // on entry; 2D entry uses the engine anchor, not this map.
  const activateAnnotateMode = useCallback(() => {
    clearSelectedLabels({});
    setMode(ModalMode.ANNOTATE);
  }, [clearSelectedLabels, setMode]);
>>>>>>> main
  const activateExploreMode = useCallback(
    () => setMode(ModalMode.EXPLORE),
    [setMode],
  );

  return useMemo(
    () => ({ activateAnnotateMode, activateExploreMode }),
    [activateExploreMode, activateAnnotateMode],
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
 * Get the sample currently being acted on in the modal.
 *
 * Unlike {@link useModalSample}, which always resolves the 2D `modalGroupSlice`
 * sample, this is 3D-aware: when a 3D slice is pinned it returns that slice's
 * sample. It mirrors the sample the sidebar and looker display, so annotation
 * edits persist to the slice the user is actually editing (e.g. a cuboid edit
 * targets the point-cloud sample, not the 2D image slice).
 *
 * Returns `undefined` if the modal is closed or the sample is still loading.
 */
export const useActiveModalSample = (): Sample | undefined => {
  const loadable = useRecoilValueLoadable(activeModalSample);

  if (loadable.state === "hasValue") {
    return loadable.contents;
  }

  return undefined;
};

/**
 * Like {@link useModalSample} but holds the last settled value across loading
 * transitions so consumers don't lose the sample mid-navigation. Returns
 * `undefined` before the first value settles. Treats `GroupSampleNotFound` as
 * a non-error (sparse groups legitimately lack a sample on the active slice);
 * all other errors still bubble.
 */
export const useStableModalSample = (): ModalSample | undefined => {
  const loadable = useRecoilValueLoadable(modalSample);
  const ref = useRef<ModalSample | undefined>(
    loadable.state === "hasValue" ? loadable.contents : undefined,
  );
  if (loadable.state === "hasValue") {
    ref.current = loadable.contents;
  }
  if (
    loadable.state === "hasError" &&
    !(loadable.contents instanceof GroupSampleNotFound)
  ) {
    throw loadable.contents;
  }
  return ref.current;
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
    ? (sample.urls.find((u) => u.field === mediaField)?.url ??
        sample.urls[0]?.url)
    : sample.urls[mediaField];
};

import { useCallback, useMemo } from "react";
import { useSetAtom } from "jotai";
import {
  useRecoilState,
  useRecoilValue,
  useRecoilValueLoadable,
} from "recoil";
import { ANNOTATE, EXPLORE, modalMode } from "../jotai";
import {
  activeFields,
  fieldSchema,
  modalSample,
  ModalSample,
  State,
} from "../recoil";
import { Schema } from "@fiftyone/utilities";
import { modalMode } from "../jotai";
import { useAtomValue } from "jotai";

/**
 * Hook which provides the modal's current active paths,
 * and a setter to update the paths.
 */
export const useActiveModalFields = () =>
  useRecoilState(activeFields({ modal: true }));

/**
 * Manager which supports switching modal modes.
 */
export interface ModalModeManager {
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
 * Hook which provides a {@link ModalModeManager}.
 */
export const useModalModeManager = (): ModalModeManager => {
  const setMode = useSetAtom(modalMode);

  const activateAnnotateMode = useCallback(() => setMode(ANNOTATE), [setMode]);
  const activateExploreMode = useCallback(() => setMode(EXPLORE), [setMode]);

  return useMemo(() => ({ activateAnnotateMode, activateExploreMode }), [
    activateExploreMode,
    activateAnnotateMode,
  ]);
};

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
 * Get the current modal mode.
 */
export const useModalMode = () => useAtomValue(modalMode);

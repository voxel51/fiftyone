import {
  dataset,
  fieldSchema,
  selectedMediaField,
  State,
} from "@fiftyone/state";
import { useRecoilValue, useResetRecoilState, useSetRecoilState } from "recoil";
import {
  current3dAnnotationModeAtom,
  hoveredLabelAtom,
  selectedLabelForAnnotationAtom,
} from "./recoil";

/**
 * Hook to retrieve the current 3D annotation mode.
 *
 * @returns The current annotation mode, or null if no mode is active
 */
export const useCurrent3dAnnotationMode = () => {
  const mode = useRecoilValue(current3dAnnotationModeAtom);

  return mode;
};

/**
 * Hook to retrieve the current dataset.
 *
 * @returns The current dataset
 */
export const useDataset = () => {
  return useRecoilValue(dataset);
};

/**
 * Hook to retrieve the frame-level field schema.
 *
 * @returns The frame schema
 */
export const useFrameSchema = () => {
  return useRecoilValue(fieldSchema({ space: State.SPACE.FRAME }));
};

/**
 * Hook to retrieve the sample-level field schema.
 *
 * @returns The sample schema
 */
export const useSampleSchema = () => {
  return useRecoilValue(fieldSchema({ space: State.SPACE.SAMPLE }));
};

/**
 * Hook to retrieve the selected media field for the grid view.
 *
 * @returns The selected media field state for the grid
 */
export const useSelectedMediaFieldGrid = () => {
  return useRecoilValue(selectedMediaField(false));
};

/**
 * Hook to retrieve the selected media field for the modal view.
 *
 * @returns The selected media field state for the modal
 */
export const useGridSelectedMediaFieldModal = () => {
  return useRecoilValue(selectedMediaField(true));
};

/**
 * Hook to set the current 3D annotation mode.
 *
 * @returns A function that accepts the annotation mode to set
 */
export const useSetCurrent3dAnnotationMode = () => {
  const setMode = useSetRecoilState(current3dAnnotationModeAtom);

  return setMode;
};

/**
 * Hook to reset the 3D annotation mode to null.
 *
 * @returns A function that resets the annotation mode when called
 */
export const useReset3dAnnotationMode = () => {
  const reset3dAnnotationMode = useResetRecoilState(
    current3dAnnotationModeAtom
  );

  return reset3dAnnotationMode;
};

/**
 * Hook to retrieve the label currently selected for 3D annotation.
 *
 * @returns The selected label, or null if nothing is selected
 */
export const useCurrentSelected3dAnnotationLabel = () => {
  return useRecoilValue(selectedLabelForAnnotationAtom);
};

/**
 * Hook to reset the selected 3D annotation label to null.
 *
 * @returns A function that clears the selection when called
 */
export const useResetSelected3dAnnotationLabel = () => {
  return useResetRecoilState(selectedLabelForAnnotationAtom);
};

/**
 * Hook to retrieve the currently hovered 3D label in annotation mode.
 *
 * @returns The hovered label identifier (`{ id }`) or null if no label is hovered
 */
export const useHoveredLabel3d = () => {
  return useRecoilValue(hoveredLabelAtom);
};

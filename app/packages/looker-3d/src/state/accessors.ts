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

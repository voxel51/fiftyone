import { useRecoilValue, useSetRecoilState } from "recoil";
import { current3dAnnotationModeAtom } from "./recoil";

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
  const setCurrent3dAnnotationMode = useSetCurrent3dAnnotationMode();

  return () => {
    setCurrent3dAnnotationMode(null);
  };
};

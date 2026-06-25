import * as fos from "@fiftyone/state";
import { useCallback } from "react";

/**
 * Hook that provides a function to focus the requested annotation slice.
 */
export function useApplyAnnotationSliceVisibility() {
  const actions = fos.useRenderConfig3dActions();

  return useCallback(
    (sliceName: string) => actions.focusSlice(sliceName),
    [actions]
  );
}

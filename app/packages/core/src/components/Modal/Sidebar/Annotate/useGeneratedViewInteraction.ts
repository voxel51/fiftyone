import type { LighterInteractionPolicy } from "@fiftyone/annotation";
import { isGeneratedView } from "@fiftyone/state";
import { useCallback, useMemo, useRef } from "react";
import { useRecoilValue } from "recoil";

/**
 * The generated-view (patches/clips/frames) interaction ownership: edit mode
 * is sticky for the single label, so deselect gestures are consumed and the
 * form stays open. Self-gates on {@link isGeneratedView}; no select
 * interception (selecting the one label is the normal route).
 */
export const useGeneratedViewInteraction = (): LighterInteractionPolicy => {
  const isGenerated = useRecoilValue(isGeneratedView);

  const isGeneratedRef = useRef(isGenerated);
  isGeneratedRef.current = isGenerated;

  const interceptDeselect = useCallback(
    (): boolean => isGeneratedRef.current,
    [],
  );

  return useMemo(() => ({ interceptDeselect }), [interceptDeselect]);
};

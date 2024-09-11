import * as fos from "@fiftyone/state";
import { useCallback } from "react";
import { useRecoilValue } from "recoil";
import { GLOBAL_TIMELINE_ID } from "./constants";

/**
 * This hook gives access to the default timeline name based on the current context.
 */
export const useDefaultTimelineName = () => {
  const maybeModalUniqueId = useRecoilValue(fos.currentModalUniqueId);

  const getName = useCallback(() => {
    if (!maybeModalUniqueId) {
      return GLOBAL_TIMELINE_ID;
    }

    return `timeline-${maybeModalUniqueId}`;
  }, [maybeModalUniqueId]);

  return { getName };
};

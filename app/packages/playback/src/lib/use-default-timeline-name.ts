import * as fos from "@fiftyone/state";
import { useCallback } from "react";
import { useRecoilValue } from "recoil";
import { GLOBAL_TIMELINE_ID } from "./constants";

/**
 * This hook gives access to the default timeline name based on the current context.
 */
export const useDefaultTimelineName = () => {
  const maybeModalSampleId = useRecoilValue(fos.nullableModalSampleId);
  const maybeGroupId = useRecoilValue(fos.groupId);

  const getName = useCallback(() => {
    if (!maybeModalSampleId) {
      return GLOBAL_TIMELINE_ID;
    }

    return `timeline-${maybeGroupId ?? ""}/${maybeModalSampleId}`;
  }, [maybeModalSampleId, maybeGroupId]);

  return { getName };
};

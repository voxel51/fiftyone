import * as fos from "@fiftyone/state";
import { useCallback, useMemo } from "react";
import { useRecoilValue } from "recoil";
import { GLOBAL_TIMELINE_ID } from "../constants";
import { getTimelineNameFromSampleAndGroupId } from "../utils";

/**
 * This hook gives access to the default timeline name based on the current context.
 */
export const useDefaultTimelineNameImperative = () => {
  const currentSampleIdVal = useRecoilValue(fos.nullableModalSampleId);
  const currentGroupIdVal = useRecoilValue(fos.groupId);

  const getName = useCallback(() => {
    if (!currentSampleIdVal && !currentGroupIdVal) {
      return GLOBAL_TIMELINE_ID;
    }

    return getTimelineNameFromSampleAndGroupId(
      currentSampleIdVal,
      currentGroupIdVal
    );
  }, [currentSampleIdVal, currentGroupIdVal]);

  return { getName };
};

export const useDefaultTimelineName = () => {
  const { getName } = useDefaultTimelineNameImperative();
  const name = useMemo(() => getName(), [getName]);
  return name;
};

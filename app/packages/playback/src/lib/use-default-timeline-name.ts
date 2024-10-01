import * as fos from "@fiftyone/state";
import { useCallback, useMemo } from "react";
import { useRecoilValue } from "recoil";
import { GLOBAL_TIMELINE_ID } from "./constants";

export const getTimelineNameFromSampleAndGroupId = (
  sampleId?: string | null,
  groupId?: string | null
) => {
  if (!sampleId && !groupId) {
    return GLOBAL_TIMELINE_ID;
  }

  if (groupId) {
    return `timeline-${groupId}`;
  }

  return `timeline-${sampleId}`;
};

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

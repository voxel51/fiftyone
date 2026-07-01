import { GLOBAL_TIMELINE_ID } from "../constants";

/**
 * Pure derivation of the default timeline name from sample/group ids.
 * Lives in its own file (separate from `use-default-timeline-name`) so
 * call sites that only need the name derivation — e.g. the seekbar
 * gradient utilities — don't transitively pull in `@fiftyone/state`
 * + recoil (which fail to load in vitest without the relay babel
 * transform set up).
 */
export const getTimelineNameFromSampleAndGroupId = (
  sampleId?: string | null,
  groupId?: string | null,
) => {
  if (!sampleId && !groupId) {
    return GLOBAL_TIMELINE_ID;
  }

  if (groupId) {
    return `timeline-${groupId}`;
  }

  return `timeline-${sampleId}`;
};

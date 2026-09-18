/**
 * Copyright 2017-2026, Voxel51, Inc.
 */
import { useRef } from "react";
import { useRecoilValue, useRecoilValueLoadable } from "recoil";
import {
  groupByFieldValue,
  isDynamicGroup,
  isNestedDynamicGroup,
  isNonNestedDynamicGroup,
  lighterDynamicGroupVideo,
} from "../../recoil/dynamicGroups";
import { isQueryPerformantDynamicGroup } from "../../recoil/queryPerformance";
import { dynamicGroupsElementCount } from "../../recoil/pathData/groups";

/**
 * Returns the last settled groupByFieldValue without ever suspending.
 *
 * groupByFieldValue derives from modalSample (a graphQLSelector) and suspends
 * during sample transitions. This hook holds the previous value steady while
 * the next one loads, preventing Suspense boundaries from triggering on every
 * sample navigation. Returns undefined until the first value has settled.
 */
export const useGroupByFieldValue = (): string | null | undefined => {
  const loadable = useRecoilValueLoadable(groupByFieldValue);
  const ref = useRef<string | null | undefined>(
    loadable.state === "hasValue" ? loadable.contents : undefined,
  );
  if (loadable.state === "hasValue") {
    ref.current = loadable.contents;
  }
  if (loadable.state === "hasError") throw loadable.contents;
  return ref.current;
};

/**
 * Returns the last settled element count for the current dynamic group without
 * suspending. Uses the stable groupByFieldValue so the count stays frozen while
 * modalSample is transitioning between pages.
 */
export const useElementsCount = (modal: boolean): number => {
  const value = useGroupByFieldValue() ?? null;
  const loadable = useRecoilValueLoadable(
    dynamicGroupsElementCount({ modal, value }),
  );
  const ref = useRef<number>(
    loadable.state === "hasValue" ? loadable.contents : 0,
  );
  if (loadable.state === "hasError") {
    throw loadable.contents;
  }
  if (loadable.state === "hasValue") {
    ref.current = loadable.contents;
  }
  return ref.current;
};

/** Whether the current view is a dynamic group. */
export const useIsDynamicGroup = (): boolean => useRecoilValue(isDynamicGroup);

/** Whether the current view is a dynamic group over a group dataset. */
export const useIsNestedDynamicGroup = (): boolean =>
  useRecoilValue(isNestedDynamicGroup);

/** Whether the current view is a dynamic group over a non-group dataset. */
export const useIsNonNestedDynamicGroup = (): boolean =>
  useRecoilValue(isNonNestedDynamicGroup);

/** Whether the dynamic group is ordered with a fixed order-by key, so paging it is indexed. */
export const useIsQueryPerformantDynamicGroup = (): boolean =>
  Boolean(useRecoilValue(isQueryPerformantDynamicGroup));

/** Whether the modal draws the dynamic group video with a Lighter surface rather than the ImaVid looker. */
export const useLighterDynamicGroupVideo = (): boolean =>
  useRecoilValue(lighterDynamicGroupVideo);

/**
 * Copyright 2017-2026, Voxel51, Inc.
 */
import { useRef } from "react";
import { useRecoilValueLoadable } from "recoil";
import { groupByFieldValue } from "../../recoil/dynamicGroups";
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
    loadable.state === "hasValue" ? loadable.contents : undefined
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
    dynamicGroupsElementCount({ modal, value })
  );
  const ref = useRef<number>(
    loadable.state === "hasValue" ? loadable.contents : 0
  );
  if (loadable.state === "hasError") {
    throw loadable.contents;
  }
  if (loadable.state === "hasValue") {
    ref.current = loadable.contents;
  }
  return ref.current;
};

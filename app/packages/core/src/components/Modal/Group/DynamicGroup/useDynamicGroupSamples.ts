import * as foq from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { useCallback, useMemo, useRef } from "react";
import { loadQuery, useRelayEnvironment } from "react-relay";
import { useRecoilValue } from "recoil";

export const useDynamicGroupSamples = () => {
  const environment = useRelayEnvironment();
  const slice = useRecoilValue(fos.groupSlice);
  const modalSlice = useRecoilValue(fos.modalGroupSlice);
  const view = useRecoilValue(fos.view);
  const rawDynamicGroup = fos.useGroupByFieldValue();
  const dataset = useRecoilValue(fos.datasetName);
  const dynamicGroupIndex = useRecoilValue(fos.dynamicGroupIndex);
  const shouldRenderImavid = useRecoilValue(fos.shouldRenderImaVidLooker(true));

  // Stabilize by-value so identical group keys don't refetch on every modal nav.
  const lastGroup = useRef<{
    key: string;
    value: typeof rawDynamicGroup;
  } | null>(null);
  const dynamicGroup = useMemo(() => {
    const key = JSON.stringify(rawDynamicGroup ?? null);
    if (lastGroup.current?.key === key) return lastGroup.current.value;
    lastGroup.current = { key, value: rawDynamicGroup };
    return rawDynamicGroup;
  }, [rawDynamicGroup]);

  const filter = useMemo(
    // slice is how the group was accessed, i.e. from the grid
    // modalSlice is the currently selected modal slice
    () => (slice ? { group: { slice, slices: [modalSlice] } } : {}),
    [slice, modalSlice]
  );
  const loadDynamicGroupSamples = useCallback(
    (cursor?: number) => {
      if (!dataset) {
        throw new Error("No dataset");
      }

      // imavid has its own fetching logic
      if (shouldRenderImavid) {
        return null;
      }

      // group key hasn't settled yet — skip the query
      if (dynamicGroup === undefined) {
        return null;
      }

      return loadQuery<foq.paginateSamplesQuery>(
        environment,
        foq.paginateSamples,
        {
          after: cursor ? String(cursor) : null,
          dataset,
          filter,
          dynamicGroup,
          view,
        }
      );
    },
    [dataset, dynamicGroup, environment, filter, shouldRenderImavid, view]
  );

  const queryRef = useMemo(
    () => loadDynamicGroupSamples(dynamicGroupIndex),
    [loadDynamicGroupSamples, dynamicGroupIndex]
  );

  return {
    queryRef,
    loadDynamicGroupSamples,
  };
};

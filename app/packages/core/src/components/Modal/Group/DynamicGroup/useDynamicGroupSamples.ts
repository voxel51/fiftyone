import * as foq from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { useCallback, useMemo } from "react";
import { loadQuery, useRelayEnvironment } from "react-relay";
import { useRecoilValue } from "recoil";

export const useDynamicGroupSamples = () => {
  const environment = useRelayEnvironment();
  const slice = useRecoilValue(fos.groupSlice);
  const modalSlice = useRecoilValue(fos.modalGroupSlice);
  const view = useRecoilValue(fos.view);
  const dynamicGroup = useRecoilValue(fos.groupByFieldValue);
  const dataset = useRecoilValue(fos.datasetName);
  const dynamicGroupIndex = useRecoilValue(fos.dynamicGroupIndex);
  const shouldRenderImavid = useRecoilValue(fos.shouldRenderImaVidLooker(true));

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

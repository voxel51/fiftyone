import * as foq from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { useCallback, useMemo } from "react";
import { loadQuery, useRelayEnvironment } from "react-relay";
import { useReverbValue } from "@fiftyone/reverb";

export const useDynamicGroupSamples = () => {
  const environment = useRelayEnvironment();
  const slice = useReverbValue(fos.groupSlice);
  const modalSlice = useReverbValue(fos.modalGroupSlice);
  const view = useReverbValue(fos.view);
  const dynamicGroup = fos.useGroupByFieldValue();
  const dataset = useReverbValue(fos.datasetName);
  const dynamicGroupIndex = useReverbValue(fos.dynamicGroupIndex);
  const shouldRenderImavid = useReverbValue(fos.shouldRenderImaVidLooker(true));

  const filter = useMemo(
    // slice is how the group was accessed, i.e. from the grid
    // modalSlice is the currently selected modal slice
    () => (slice ? { group: { slice, slices: [modalSlice] } } : {}),
    [slice, modalSlice],
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

      // group key hasn't settled (undefined) or is transiently null while
      // modal group state initializes — skip the query
      if (dynamicGroup == null) {
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
        },
      );
    },
    [dataset, dynamicGroup, environment, filter, shouldRenderImavid, view],
  );

  const queryRef = useMemo(
    () => loadDynamicGroupSamples(dynamicGroupIndex),
    [loadDynamicGroupSamples, dynamicGroupIndex],
  );

  return {
    queryRef,
    loadDynamicGroupSamples,
  };
};

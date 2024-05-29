import * as foq from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { useCallback, useMemo } from "react";
import { loadQuery, useRelayEnvironment } from "react-relay";
import { useRecoilValue } from "recoil";

export const useDynamicGroupSamples = () => {
  const environment = useRelayEnvironment();
  const slice = useRecoilValue(fos.groupSlice);
  const view = useRecoilValue(fos.dynamicGroupViewQuery(null));
  const dataset = useRecoilValue(fos.datasetName);
  const dynamicGroupIndex = useRecoilValue(fos.dynamicGroupIndex);
  const shouldRenderImavid = useRecoilValue(fos.shouldRenderImaVidLooker);

  const filter = useMemo(
    () => (slice ? { group: { slice, slices: [slice] } } : {}),
    [slice]
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
          view,
        }
      );
    },
    [dataset, environment, filter, shouldRenderImavid, view]
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

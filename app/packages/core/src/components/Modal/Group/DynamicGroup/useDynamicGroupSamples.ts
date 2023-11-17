import * as foq from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { useCallback, useMemo } from "react";
import { loadQuery, useRelayEnvironment } from "react-relay";
import { useRecoilValue } from "recoil";

export const useDynamicGroupSamples = () => {
  const environment = useRelayEnvironment();
  const slice = useRecoilValue(fos.groupSlice);
  const view = useRecoilValue(fos.dynamicGroupViewQuery({}));
  const dataset = useRecoilValue(fos.datasetName);
  const dynamicGroupIndex = useRecoilValue(fos.dynamicGroupIndex);

  const loadDynamicGroupSamples = useCallback(
    (cursor?: number) => {
      if (!dataset) {
        throw new Error("No dataset");
      }

      return loadQuery<foq.paginateSamplesQuery>(
        environment,
        foq.paginateSamples,
        {
          after: cursor ? String(cursor) : null,
          dataset,
          filter: {
            group: {
              slice,
            },
          },
          view,
        }
      );
    },
    [dataset, environment, slice, view]
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

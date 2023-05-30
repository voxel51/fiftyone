import { useRecoilCallback } from "recoil";
import * as fos from "@fiftyone/state";
import * as foq from "@fiftyone/relay";
import { loadQuery, useQueryLoader } from "react-relay";
import { useEffect } from "react";
import { useGroupContext } from "./GroupContextProvider";

/**
 * Loads paginated samples for a dynamic group
 * @param batchSize number of samples to load at a time
 * @returns [queryRef, loadPaginatedSamples]
 */
export const useDynamicGroupPaginatedSamples = (batchSize = 20) => {
  const { groupByFieldValue } = useGroupContext();

  const [queryRef, loadQuery] =
    useQueryLoader<foq.paginateDynamicGroupSamplesQuery>(
      foq.paginateDynamicGroupSamples
    );

  const loadPaginatedSamples = useRecoilCallback(
    ({ snapshot }) =>
      async (cursor?: number) => {
        const variables = {
          dataset: await snapshot.getPromise(fos.datasetName),
          filter: {},
          view: await snapshot.getPromise(
            fos.dynamicGroupViewQuery(groupByFieldValue!)
          ),
          cursor: cursor ? String(cursor) : null,
        };

        loadQuery(variables);
      },
    [loadQuery, groupByFieldValue]
  );

  useEffect(() => {
    if (!queryRef) {
      loadPaginatedSamples();
    }
  }, [queryRef, loadPaginatedSamples]);

  return [queryRef, loadPaginatedSamples] as const;
};

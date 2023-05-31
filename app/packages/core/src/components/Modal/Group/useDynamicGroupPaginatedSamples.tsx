import * as foq from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { useEffect } from "react";
import { usePreloadedQuery, useQueryLoader } from "react-relay";
import { useRecoilCallback, useRecoilState, useRecoilValue } from "recoil";
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

export const useDynamicGroupSamplesStoreMap = (queryRef) => {
  const { groupBy, orderBy } = useRecoilValue(fos.dynamicGroupParameters)!;
  const { groupByFieldValue } = useGroupContext();

  const atomFamilyKey = `${groupBy}-${orderBy}-${groupByFieldValue!}`;

  const [dynamicGroupSamplesStoreMap, setDynamicGroupSamplesStoreMap] =
    useRecoilState(fos.dynamicGroupSamplesStoreMap(atomFamilyKey));

  // fetch a bunch of frames
  const data = usePreloadedQuery<foq.paginateDynamicGroupSamplesQuery>(
    foq.paginateDynamicGroupSamples,
    queryRef
  );

  /**
   * This effect is responsible for parsing gql response into a sample map
   */
  useEffect(() => {
    if (!data?.samples?.edges?.length) {
      return;
    }

    setDynamicGroupSamplesStoreMap((prev) => {
      const newMap = new Map(prev);

      for (const { cursor, node } of data.samples.edges) {
        newMap.set(Number(cursor), node as unknown as fos.SampleData);
      }

      return newMap;
    });
  }, [data, setDynamicGroupSamplesStoreMap]);

  return dynamicGroupSamplesStoreMap;
};

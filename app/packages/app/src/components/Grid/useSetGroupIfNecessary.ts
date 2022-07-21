import {} from "react";
import { loadQuery, useRelayEnvironment } from "react-relay";
import { useRecoilCallback } from "recoil";

import * as fos from "@fiftyone/state";
import { paginateGroup, paginateGroupQuery } from "@fiftyone/relay";

export default (store: fos.LookerStore<any>) => {
  const environment = useRelayEnvironment();
  return useRecoilCallback(
    ({ snapshot, set }) =>
      async (sampleId: string) => {
        const dataset = await snapshot.getPromise(fos.datasetName);
        const view = await snapshot.getPromise(fos.view);
        const current = await snapshot.getPromise(fos.paginateGroupQueryRef);
        current && current.dispose();
        const sample = store.samples.get(sampleId);

        const groupField = await snapshot.getPromise(fos.groupField);

        if (await snapshot.getPromise(fos.isGroup))
          set(
            fos.paginateGroupQueryRef,
            loadQuery<paginateGroupQuery>(
              environment,
              paginateGroup,
              {
                dataset,
                view,
                groupId: sample?.sample[groupField]._id,
                pinnedSampleFilter: {
                  group: {
                    id: sample?.sample[groupField]._id,
                    group: await snapshot.getPromise(fos.pinnedSampleGroup),
                    groupField,
                  },
                },
              },
              {
                networkCacheConfig: { force: true },
              }
            )
          );
      },
    [environment]
  );
};

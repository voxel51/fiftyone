import {} from "react";
import { loadQuery, useRelayEnvironment } from "react-relay";
import { useRecoilCallback } from "recoil";

import * as fos from "@fiftyone/state";
import { paginateGroup, paginateGroupQuery } from "@fiftyone/relay";

export default () => {
  const environment = useRelayEnvironment();
  return useRecoilCallback(
    ({ snapshot, set }) =>
      async () => {
        const dataset = await snapshot.getPromise(fos.datasetName);
        const view = await snapshot.getPromise(fos.view);
        const current = await snapshot.getPromise(fos.paginateGroupQueryRef);
        current && current.dispose();
        set(
          fos.paginateGroupQueryRef,
          loadQuery<paginateGroupQuery>(
            environment,
            paginateGroup,
            {
              dataset,
              view,
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

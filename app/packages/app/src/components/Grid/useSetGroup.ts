import {} from "react";
import { loadQuery, useRelayEnvironment } from "react-relay";
import { useRecoilCallback } from "recoil";

import {
  paginateGroup,
  paginateGroupQuery,
  paginateGroupQueryRef,
} from "../../queries";

import * as selectors from "../../recoil/selectors";
import * as viewAtoms from "../../recoil/view";

export default () => {
  const environment = useRelayEnvironment();
  return useRecoilCallback(
    ({ snapshot, set }) =>
      async () => {
        const dataset = await snapshot.getPromise(selectors.datasetName);
        const view = await snapshot.getPromise(viewAtoms.view);
        const current = await snapshot.getPromise(paginateGroupQueryRef);
        current && current.dispose();
        set(
          paginateGroupQueryRef,
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

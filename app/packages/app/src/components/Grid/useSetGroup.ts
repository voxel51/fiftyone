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
        set(
          paginateGroupQueryRef,
          loadQuery<paginateGroupQuery>(environment, paginateGroup, {
            dataset,
            view,
          })
        );
      },
    [environment]
  );
};

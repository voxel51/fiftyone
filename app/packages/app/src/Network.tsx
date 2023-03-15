import { ErrorBoundary } from "@fiftyone/components";
import { RelayEnvironmentKey } from "@fiftyone/state";

import React from "react";
import { RelayEnvironmentProvider } from "react-relay";
import { IEnvironment } from "relay-runtime";
import { RecoilRelayEnvironment } from "recoil-relay";
import { Queries, RouterContext, RoutingContext } from "./routing";
import { Renderer } from "./routing";
import Sync from "./Sync";

const Network: React.FC<{
  environment: IEnvironment;
  context: RoutingContext<Queries>;
}> = ({ environment, context }) => {
  return (
    <ErrorBoundary>
      <RelayEnvironmentProvider environment={environment}>
        <RecoilRelayEnvironment
          environment={environment}
          environmentKey={RelayEnvironmentKey}
        >
          <RouterContext.Provider value={context}>
            <Sync>
              <Renderer router={context} />
            </Sync>
          </RouterContext.Provider>
        </RecoilRelayEnvironment>
      </RelayEnvironmentProvider>
    </ErrorBoundary>
  );
};

export default Network;

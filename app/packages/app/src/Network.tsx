import { RelayEnvironmentContext } from "@fiftyone/relay";
import { RelayEnvironmentKey } from "@fiftyone/state";
import React from "react";
import { RelayEnvironmentProvider } from "react-relay";
import { RecoilRelayEnvironment } from "recoil-relay";
import { IEnvironment } from "relay-runtime";
import Sync from "./Sync";
import { Queries } from "./makeRoutes";
import { Renderer, RouterContext, RoutingContext } from "./routing";

const Network: React.FC<{
  environment: IEnvironment;
  context: RoutingContext<Queries>;
}> = ({ environment, context }) => {
  return (
    <RelayEnvironmentProvider environment={environment}>
      <RecoilRelayEnvironment
        environment={environment}
        environmentKey={RelayEnvironmentKey}
      >
        <RouterContext.Provider value={context}>
          <RelayEnvironmentContext.Provider value={environment}>
            <Sync>
              <Renderer />
            </Sync>
          </RelayEnvironmentContext.Provider>
        </RouterContext.Provider>
      </RecoilRelayEnvironment>
    </RelayEnvironmentProvider>
  );
};

export default Network;

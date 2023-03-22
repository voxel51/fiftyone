import { RelayEnvironmentKey } from "@fiftyone/state";
import React from "react";
import { RelayEnvironmentProvider } from "react-relay";
import { RecoilRelayEnvironment } from "recoil-relay";
import { IEnvironment } from "relay-runtime";
import { Queries, Renderer, RouterContext, RoutingContext } from "./routing";
import Sync from "./Sync";

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
          <Sync>
            <Renderer router={context} />
          </Sync>
        </RouterContext.Provider>
      </RecoilRelayEnvironment>
    </RelayEnvironmentProvider>
  );
};

export default Network;

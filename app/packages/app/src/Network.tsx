import { ErrorBoundary, Loading } from "@fiftyone/components";
import { RelayEnvironmentKey } from "@fiftyone/state";

import React, { Suspense } from "react";
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
    <RelayEnvironmentProvider environment={environment}>
      <RecoilRelayEnvironment
        environment={environment}
        environmentKey={RelayEnvironmentKey}
      >
        <RouterContext.Provider value={context}>
          <ErrorBoundary>
            <Suspense fallback={<Loading>Pixelating...</Loading>}>
              <Sync>
                <Renderer router={context} />
              </Sync>
            </Suspense>
          </ErrorBoundary>
        </RouterContext.Provider>
      </RecoilRelayEnvironment>
    </RelayEnvironmentProvider>
  );
};

export default Network;

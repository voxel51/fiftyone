import {
  RouterContext,
  RouteRenderer,
  RoutingContext,
} from "@fiftyone/components";
import React, { Suspense } from "react";
import { Environment, RelayEnvironmentProvider } from "react-relay";

const Network: React.FC<{
  environment: Environment;
  context: RoutingContext<any>;
}> = ({ environment, context }) => {
  return (
    <RelayEnvironmentProvider environment={environment}>
      <RouterContext.Provider value={context}>
        <Suspense fallback={null}>
          <RouteRenderer router={context} />
        </Suspense>
      </RouterContext.Provider>
    </RelayEnvironmentProvider>
  );
};

export default Network;

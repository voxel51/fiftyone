import {
  RouterContext,
  RouteRenderer,
  RoutingContext,
} from "@fiftyone/components";

import React, { Suspense, useContext } from "react";
import { Environment, RelayEnvironmentProvider } from "react-relay";

const Renderer: React.FC = () => {
  const context = useContext(RouterContext);

  return (
    <Suspense fallback={null}>
      <RouteRenderer router={context} />
    </Suspense>
  );
};

const Network: React.FC<{
  environment: Environment;
  context: RoutingContext<any>;
}> = ({ environment, context }) => {
  return (
    <RelayEnvironmentProvider environment={environment}>
      <RouterContext.Provider value={context}>
        <Renderer />
      </RouterContext.Provider>
    </RelayEnvironmentProvider>
  );
};

export default Network;

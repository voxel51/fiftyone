import {
  ErrorBoundary,
  Loading,
  RouterContext,
  RouteRenderer,
  RoutingContext,
  useRouter,
} from "@fiftyone/components";
import { modal, refresher } from "@fiftyone/state";

import React, { Suspense, useContext, useEffect } from "react";
import { Environment, RelayEnvironmentProvider } from "react-relay";
import { useRecoilValue } from "recoil";

const Renderer: React.FC = () => {
  const context = useContext(RouterContext);

  return (
    <Suspense fallback={<Loading>Pixelating...</Loading>}>
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
        <ErrorBoundary>
          <Renderer />
        </ErrorBoundary>
      </RouterContext.Provider>
    </RelayEnvironmentProvider>
  );
};

export const NetworkRenderer = ({ makeRoutes }) => {
  const refreshRouter = useRecoilValue(refresher);
  const { context, environment } = useRouter(makeRoutes, [refreshRouter]);

  const isModalActive = Boolean(useRecoilValue(modal));

  useEffect(() => {
    document.body.classList.toggle("noscroll", isModalActive);
    document
      .getElementById("modal")
      ?.classList.toggle("modalon", isModalActive);
  }, [isModalActive]);

  return <Network environment={environment} context={context} />;
};

export default Network;

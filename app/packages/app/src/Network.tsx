import { ErrorBoundary, Loading, RouteRenderer } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { RelayEnvironmentKey } from "@fiftyone/state";

import React, { Suspense, useContext, useEffect } from "react";
import { Environment } from "react-relay";
import { useRecoilValue } from "recoil";
import { RecoilRelayEnvironmentProvider } from "recoil-relay";

const Renderer: React.FC = () => {
  const context = useContext(fos.RouterContext);

  return (
    <Suspense fallback={<Loading>Pixelating...</Loading>}>
      <RouteRenderer router={context} />
    </Suspense>
  );
};

const Network: React.FC<{
  environment: Environment;
  context: fos.RoutingContext<any>;
}> = ({ environment, context }) => {
  return (
    <RecoilRelayEnvironmentProvider
      environment={environment}
      environmentKey={RelayEnvironmentKey}
    >
      <fos.RouterContext.Provider value={context}>
        <ErrorBoundary>
          <Renderer />
        </ErrorBoundary>
      </fos.RouterContext.Provider>
    </RecoilRelayEnvironmentProvider>
  );
};

export const NetworkRenderer = ({ makeRoutes }) => {
  const refreshRouter = useRecoilValue(fos.refresher);
  const { context, environment } = fos.useRouter(makeRoutes, [refreshRouter]);

  const isModalActive = Boolean(useRecoilValue(fos.modal));

  useEffect(() => {
    document.body.classList.toggle("noscroll", isModalActive);
    document
      .getElementById("modal")
      ?.classList.toggle("modalon", isModalActive);
  }, [isModalActive]);

  return <Network environment={environment} context={context} />;
};

export default Network;

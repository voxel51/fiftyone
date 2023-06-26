import { Loading, RouteRenderer } from "@fiftyone/components";
import { tick, tickSubscription } from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { RelayEnvironmentKey } from "@fiftyone/state";

import React, { Suspense, useContext, useEffect, useMemo } from "react";
import { Environment, useSubscription } from "react-relay";
import { useRecoilValue } from "recoil";
import { RecoilRelayEnvironmentProvider } from "recoil-relay";

const Renderer: React.FC = () => {
  const context = useContext(fos.RouterContext);
  const s = useSubscription<tickSubscription>(
    useMemo(
      () => ({
        subscription: tick,
        variables: {},
        onNext: (...all) => {
          console.log("HEREEE", all);
        },
      }),
      []
    )
  );
  const v = useRecoilValue(fos.tick);
  console.log(v);

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
  console.log("EJHH");
  return (
    <RecoilRelayEnvironmentProvider
      environment={environment}
      environmentKey={RelayEnvironmentKey}
    >
      <fos.RouterContext.Provider value={context}>
        <Renderer />
      </fos.RouterContext.Provider>
    </RecoilRelayEnvironmentProvider>
  );
};

export const NetworkRenderer = ({ makeRoutes }) => {
  const { context, environment } = fos.useRouter(makeRoutes, []);

  const isModalOpen = useRecoilValue(fos.isModalActive);

  useEffect(() => {
    document.body.classList.toggle("noscroll", isModalOpen);
    document.getElementById("modal")?.classList.toggle("modalon", isModalOpen);
  }, [isModalOpen]);

  return <Network environment={environment} context={context} />;
};

export default Network;

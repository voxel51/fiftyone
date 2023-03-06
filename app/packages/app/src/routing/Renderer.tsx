import { Loading } from "@fiftyone/components";
import React, { Suspense, useEffect, useLayoutEffect, useState } from "react";
import { Queries } from ".";
import { Entry, RoutingContext } from "./RouterContext";
import style from "./pending.module.css";
import { atom, useRecoilValue } from "recoil";
import { syncEffect } from "recoil-sync";
import { custom } from "@recoiljs/refine";

const Pending = () => {
  return <div className={style.pending} />;
};

export const entry = atom({
  key: "entry",
  default: null,
  effects: [
    syncEffect({
      storeKey: "router",
      refine: custom((v) => v),
    }),
  ],
  dangerouslyAllowMutability: true,
});

const Renderer: React.FC<{ router: RoutingContext<Queries> }> = ({
  router,
}) => {
  const routeEntry = useRecoilValue<Entry<Queries>>(entry);
  const [pending, setPending] = useState(false);

  useLayoutEffect(() => {
    return router.subscribe(
      (nextEntry) => {
        setPending(false);
      },
      () => setPending(true)
    );
  }, [router]);

  const loading = <Loading>Pixelating</Loading>;

  if (!routeEntry) return loading;

  return (
    <Suspense fallback={loading}>
      <Route route={routeEntry} />
      {pending && <Pending />}
    </Suspense>
  );
};

const Route = <T extends Queries>({ route }: { route: Entry<T> }) => {
  const Component = route.component.read();

  const { prepared } = route;

  return <Component prepared={prepared.read()} />;
};

export default Renderer;

import { Loading } from "@fiftyone/components";
import { custom } from "@recoiljs/refine";
import React, { Suspense, useEffect, useState } from "react";
import { atom, useRecoilValue } from "recoil";
import { syncEffect } from "recoil-sync";

import { Queries } from ".";
import { Entry, RoutingContext } from "./RouterContext";
import style from "./pending.module.css";

const Pending = () => {
  return <div className={style.pending} />;
};

export const entry = atom<Entry<Queries>>({
  key: "entry",
  effects: [
    syncEffect({
      storeKey: "router",
      refine: custom<Entry<Queries>>((v) => v as Entry<Queries>),
    }),
  ],
  dangerouslyAllowMutability: true,
});

const Renderer: React.FC<{ router: RoutingContext<Queries> }> = ({
  router,
}) => {
  const routeEntry = useRecoilValue<Entry<Queries>>(entry);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    return router.subscribe(
      () => {
        setPending(false);
      },
      () => setPending(true)
    );
  }, [router]);

  const orthographicProjectionField = Object.entries({})
    .find((el) => el[1] && el[1]["_cls"] === "OrthographicProjectionMetadata")
    ?.at(0) as string | undefined;

  const loading = <Loading>Pixelating...</Loading>;

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

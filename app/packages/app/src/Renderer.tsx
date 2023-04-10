import { Loading } from "@fiftyone/components";
import React, { Suspense, useEffect, useState } from "react";

import { atom, useRecoilState } from "recoil";
import style from "./pending.module.css";
import { Queries, useRouterContext } from "./routing";
import { Entry } from "./routing/RouterContext";

const Pending = () => {
  return <div className={style.pending} />;
};

export const pendingEntry = atom<boolean>({
  key: "pendingEntry",
  default: false,
});

const Renderer = () => {
  const [routeEntry, setRouteEntry] = useState<Entry<Queries>>();
  const [pending, setPending] = useRecoilState(pendingEntry);
  const router = useRouterContext();

  useEffect(() => {
    router.load().then(setRouteEntry);
    return router.subscribe(
      (entry) => {
        setRouteEntry(entry);
        setPending(false);
      },
      () => setPending(true)
    );
  }, [router]);

  const loading = <Loading>Pixelating...</Loading>;

  if (!routeEntry) return loading;

  return (
    <Suspense fallback={loading}>
      <Route route={routeEntry} />
      {pending && <Pending />}
    </Suspense>
  );
};

const Route = ({ route }: { route: Entry<Queries> }) => {
  const Component = route.component;
  return <Component prepared={route.preloadedQuery} />;
};

export default Renderer;

import { Loading } from "@fiftyone/components";
import { subscribe } from "@fiftyone/relay";
import React, { Suspense, useEffect } from "react";
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

export const entry = atom<Entry<Queries> | null>({
  key: "Entry",
  default: null,
  dangerouslyAllowMutability: true,
});

const Renderer = () => {
  const [routeEntry, setRouteEntry] = useRecoilState(entry);
  const [pending, setPending] = useRecoilState(pendingEntry);
  const router = useRouterContext();

  useEffect(() => {
    router.load().then(setRouteEntry);
    subscribe((_, { set }) => {
      set(entry, router.get());
      set(pendingEntry, false);
    });
  }, [router, setRouteEntry]);

  useEffect(() => {
    return router.subscribe(
      () => {},
      () => setPending(true)
    );
  }, [router, setPending]);

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

import { Loading } from "@fiftyone/components";
import React, {
  Suspense,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  PageQueryContext,
  PageSubscription,
} from "@fiftyone/relay/src/PageQuery";
import { custom } from "@recoiljs/refine";
import { atom, useRecoilValue } from "recoil";
import { syncEffect } from "recoil-sync";
import { Queries } from ".";
import style from "./pending.module.css";
import { Entry, RouterContext, RoutingContext } from "./RouterContext";

const Pending = () => {
  return <div className={style.pending} />;
};

export const entry = atom<Entry<Queries>>({
  key: "routeEntry",
  effects: [
    syncEffect({
      refine: custom<Entry<Queries>>((v) => v as Entry<Queries>),
      storeKey: "session",
    }),
  ],
  dangerouslyAllowMutability: true,
});

const Renderer: React.FC<{ router: RoutingContext<Queries> }> = ({
  router,
}) => {
  const routeEntry = useRecoilValue(entry);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    return router.subscribe(
      () => {
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
  const router = useContext(RouterContext);
  const Component = route.component;
  const subscriptions = useRef(new Set<PageSubscription<Queries>>());
  useEffect(() => {
    return router?.subscribe(({ concreteRequest, preloadedQuery, data }) => {
      subscriptions.current.forEach((cb) => {
        cb({
          concreteRequest,
          preloadedQuery,
          data,
        });
      });
    });
  }, [router]);

  return (
    <PageQueryContext
      concreteRequest={route.concreteRequest}
      preloadedQuery={route.preloadedQuery}
      data={route.data}
      subscribe={(fn: PageSubscription<Queries>) => {
        subscriptions.current.add(fn);

        return () => subscriptions.current.delete(fn);
      }}
    >
      <Component prepared={route.preloadedQuery} />
    </PageQueryContext>
  );
};

export default Renderer;

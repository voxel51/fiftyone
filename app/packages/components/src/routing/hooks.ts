import { useCallback, useContext, useEffect, useTransition } from "react";
import { OperationType } from "relay-runtime";
import { Entry, RouterContext, RoutingContext } from "./RouterContext";

export const goTo = (router: RoutingContext, path: string) => {
  router.history.push(path);
};

export const useTo = () => {
  const router = useContext(RouterContext);
  const [pending, start] = useTransition();

  return {
    pending,
    start: useCallback((to: string) => () => router.preload(to), [router]),
    to: useCallback((to: string) => start(() => goTo(router, to)), [router]),
  };
};

export const useSubscribe = (cb: (entry: Entry<OperationType>) => void) => {
  const router = useContext(RouterContext);
  useEffect(() => router.subscribe(cb), [router, cb]);
};

import { useCallback, useContext, useEffect, useTransition } from "react";
import { OperationType, VariablesOf } from "relay-runtime";
import { Entry, RouterContext, RoutingContext } from "./RouterContext";

export const goTo = (router: RoutingContext, path: string, state: any) => {
  router.history.push(path, state);
};

export const useTo = (state: any) => {
  const router = useContext(RouterContext);
  const [pending, start] = useTransition();

  return {
    pending,
    to: useCallback(
      (to: string) => start(() => goTo(router, to, state)),
      [router, state]
    ),
  };
};

export const useSubscribe = (cb: (entry: Entry<OperationType>) => void) => {
  const router = useContext(RouterContext);
  useEffect(() => router.subscribe(cb), [router, cb]);
};

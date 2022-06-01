import { useCallback, useContext, useEffect, useTransition } from "react";
import { OperationType, VariablesOf } from "relay-runtime";
import { Entry, RouterContext, RoutingContext } from "./RouterContext";

export const goTo = <O extends OperationType>(
  router: RoutingContext,
  path: string,
  variables: Partial<VariablesOf<O>>
) => {
  router.history.push(path, variables);
};

export const useTo = <O extends OperationType>(
  variables: Partial<VariablesOf<O>>
) => {
  const router = useContext(RouterContext);
  const [pending, start] = useTransition();

  return {
    pending,
    to: useCallback(
      (to: string) => start(() => goTo(router, to, variables)),
      [router, variables]
    ),
  };
};

export const useSubscribe = (cb: (entry: Entry<OperationType>) => void) => {
  const router = useContext(RouterContext);
  useEffect(() => router.subscribe(cb), [router, cb]);
};

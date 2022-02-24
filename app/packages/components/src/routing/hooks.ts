import { useCallback, useEffect } from "react";
import { OperationType } from "relay-runtime";
import { Entry, RoutingContext } from "./RoutingContext";

export const goTo = (router: RoutingContext, path: string) => {
  router.history.push(path);
};

export const useTo = (router: RoutingContext) => {
  return {
    to: useCallback((to: string) => goTo(router, to), [router]),
    start: useCallback((to: string) => router.preloadCode(to), [router]),
    query: useCallback((to: string) => router.preload(to), [router]),
  };
};

export const useSubscribe = (
  router: RoutingContext,
  cb: (entry: Entry<OperationType>) => void
) => {
  useEffect(() => router.subscribe(cb), [router, cb]);
};

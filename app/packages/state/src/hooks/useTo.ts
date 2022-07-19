import { useCallback, useContext, useTransition } from "react";
import { RouterContext, RoutingContext } from "../routing";

const goTo = (router: RoutingContext, path: string, state: any) => {
  router.history.push(path, state);
};

const useTo = (state: any) => {
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

export default useTo;

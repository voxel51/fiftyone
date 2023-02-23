import { useCallback, useTransition } from "react";
import { Queries, RoutingContext, useRouterContext } from "./routing";

const goTo = (router: RoutingContext<Queries>, path: string) => {
  const searchParams = new URLSearchParams(window.location.search);
  searchParams.delete("view");
  const search = searchParams.toString();
  router.history.push(`${path}${search.length ? "?" : ""}${search}`);
};

const useTo = () => {
  const router = useRouterContext();
  const [pending, start] = useTransition();
  const to = useCallback((to: string) => start(() => goTo(router, to)), [
    router,
  ]);

  return {
    pending,
    to,
  };
};

export default useTo;

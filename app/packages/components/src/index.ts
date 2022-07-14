import { matchPath, RoutingContext } from "./routing";

export * from "./components";
export * from "./contexts";
export * from "./routing";
export * from "./use";

export { scrollable } from "./scrollable.module.css";

export const getDatasetName = (context: RoutingContext<any>): string => {
  const result = matchPath(
    context.pathname,
    {
      path: "/datasets/:name",
      exact: true,
    },
    {}
  );

  if (result) {
    return result.variables.name;
  }

  return null;
};

import React from "react";
import { PreloadedQuery } from "react-relay";

import { datasetQuery } from "../pages/datasets/__generated__/datasetQuery.graphql";
import { pagesQuery } from "../pages/__generated__/pagesQuery.graphql";

export { default as Renderer } from "../Renderer";
export * from "./matchPath";
export * from "./RouteDefinition";
export * from "./RouterContext";
export { default as useRouter } from "./useRouter";
export { default as useRouterContext } from "./useRouterContext";

export type Queries = pagesQuery | datasetQuery;

export type Route<T extends Queries> = React.FC<
  React.PropsWithChildren<{
    prepared: PreloadedQuery<T>;
  }>
>;

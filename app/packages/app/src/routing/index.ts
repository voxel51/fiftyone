import type React from "react";
import type { PreloadedQuery } from "react-relay";
import type { OperationType } from "relay-runtime";
export { default as Renderer } from "../Renderer";
export * from "./RouteDefinition";
export * from "./RouterContext";
export * from "./matchPath";
export { default as useRouter } from "./useRouter";
export { default as useRouterContext } from "./useRouterContext";

export type Route<T extends OperationType> = React.FC<
  React.PropsWithChildren<{
    prepared: PreloadedQuery<T>;
  }>
>;

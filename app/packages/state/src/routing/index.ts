import React from "react";
import { PreloadedQuery } from "react-relay";
import { OperationType } from "relay-runtime";

export * from "./matchPath";
export * from "./RouterContext";
export * from "./RouteDefinition";

import { RouteData } from "./RouterContext";

export type Route<Operation extends OperationType | undefined = OperationType> =
  React.FC<
    React.PropsWithChildren<{
      prepared: Operation extends OperationType
        ? PreloadedQuery<Operation>
        : undefined;
      routeData?: RouteData<Operation>;
    }>
  >;

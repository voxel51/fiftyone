import React from "react";
import { PreloadedQuery } from "react-relay";
import { OperationType } from "relay-runtime";

export type RouteComponent<
  Operation extends OperationType = OperationType
> = React.FC<{
  prepared: PreloadedQuery<Operation>;
  routeData: { params: unknown };
}>;

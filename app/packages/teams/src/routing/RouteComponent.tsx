import React from "react";
import { PreloadedQuery } from "react-relay";
import { OperationType, VariablesOf } from "relay-runtime";

export type RouteComponent<Operation extends OperationType> = React.FC<{
  prepared: PreloadedQuery<Operation>;
  routeData: { params: VariablesOf<Operation> };
}>;

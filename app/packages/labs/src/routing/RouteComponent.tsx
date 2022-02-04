import React from "react";
import { PreloadedQuery } from "react-relay";
import { OperationType } from "relay-runtime";

export type RouteComponent = React.FC<{
  prepared: PreloadedQuery<OperationType>;
  routeData: { params: any };
}>;

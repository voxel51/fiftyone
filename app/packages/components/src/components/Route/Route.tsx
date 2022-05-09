import React from "react";
import { PreloadedQuery } from "react-relay";
import { OperationType } from "relay-runtime";

import { RouteData } from "../../routing";

export type Route<
  Operation extends OperationType | undefined = OperationType
> = React.FC<{
  prepared?: PreloadedQuery<Operation extends undefined ? never : Operation>;
  routeData?: RouteData<Operation>;
}>;

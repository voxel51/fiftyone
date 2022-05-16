import React from "react";
import { PreloadedQuery } from "react-relay";
import { OperationType } from "relay-runtime";

import { RouteData } from "../../routing";

export type Route<
  Operation extends OperationType | undefined = undefined
> = React.FC<
  React.PropsWithChildren<{
    prepared?: Operation extends OperationType
      ? PreloadedQuery<Operation>
      : undefined;
    routeData?: RouteData<Operation>;
  }>
>;

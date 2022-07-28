import { Environment } from "relay-runtime";
import React, { useMemo, useRef, useState } from "react";

import {
  RouteDefinition,
  createRouter,
  Router,
  getEnvironment,
} from "../routing";

const useRouter = (
  makeRoutes: (environment: Environment) => RouteDefinition[],
  deps?: React.DependencyList | undefined
) => {
  const [environment] = useState(getEnvironment);
  const router = useRef<Router<any>>();

  router.current = useMemo(() => {
    router.current && router.current.cleanup();

    return createRouter(environment, makeRoutes(environment));
  }, [environment, ...(deps || [])]);

  return { context: router.current.context, environment };
};

export default useRouter;

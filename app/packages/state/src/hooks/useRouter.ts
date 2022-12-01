import { Environment } from "relay-runtime";
import React, { useMemo, useRef } from "react";

import {
  RouteDefinition,
  createRouter,
  Router,
  getEnvironment,
} from "../routing";

let currentEnvironment: Environment = getEnvironment();

export const getCurrentEnvironment = () => {
  return currentEnvironment;
};

export const setCurrentEnvironment = (environment: Environment) => {
  currentEnvironment = environment;
};

const useRouter = (
  makeRoutes: (environment: Environment) => RouteDefinition[],
  deps?: React.DependencyList | undefined
) => {
  const router = useRef<Router<any>>();

  router.current = useMemo(() => {
    currentEnvironment = getEnvironment();
    router.current && router.current.cleanup();

    return createRouter(currentEnvironment, makeRoutes(currentEnvironment));
  }, [...(deps || [])]);

  return { context: router.current.context, environment: currentEnvironment };
};

export default useRouter;

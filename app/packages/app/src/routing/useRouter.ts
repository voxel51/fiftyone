import { getEnvironment, setCurrentEnvironment } from "@fiftyone/state";
import { useMemo, useRef } from "react";

import { useErrorHandler } from "react-error-boundary";
import { type Router, createRouter } from ".";
import makeRoutes, { type Queries } from "../makeRoutes";

const environment = getEnvironment();
setCurrentEnvironment(environment);

const useRouter = () => {
  const router = useRef<Router<Queries>>();
  const handleError = useErrorHandler();

  router.current = useMemo(() => {
    router.current?.cleanup();

    return createRouter<Queries>(environment, makeRoutes(), handleError);
  }, [handleError]);

  return { context: router.current.context, environment };
};

export default useRouter;

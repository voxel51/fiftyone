import { getEnvironment, setCurrentEnvironment } from "@fiftyone/state";
import { useMemo, useRef } from "react";

import { createRouter, Router } from ".";
import makeRoutes, { Queries } from "../makeRoutes";

const environment = getEnvironment();
setCurrentEnvironment(environment);

const useRouter = () => {
  const router = useRef<Router<Queries>>();

  router.current = useMemo(() => {
    router.current && router.current.cleanup();

    return createRouter<Queries>(environment, makeRoutes());
  }, []);

  return { context: router.current.context, environment };
};

export default useRouter;

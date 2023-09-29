import { Setter } from "@fiftyone/relay";
import { Session } from "@fiftyone/state";
import { MutableRefObject, useMemo } from "react";
import { Environment } from "react-relay";
import { Queries } from "../makeRoutes";
import { RoutingContext } from "../routing";
import { REGISTERED_SETTERS } from "./registerSetter";

const useSetters = (
  environment: Environment,
  router: RoutingContext<Queries>,
  sessionRef: MutableRefObject<Session>
) => {
  return useMemo(() => {
    const setters = new Map<string, Setter>();
    const ctx = { environment, router, sessionRef };
    REGISTERED_SETTERS.forEach((value, key) => {
      setters.set(key, value(ctx));
    });

    return setters;
  }, [environment, router, sessionRef]);
};

export default useSetters;

import { type Session, useSession } from "@fiftyone/state";
import { env } from "@fiftyone/utilities";
import type { MutableRefObject } from "react";
import type { Environment } from "react-relay";
import type { Queries } from "../makeRoutes";
import type { RoutingContext } from "../routing";
import { REGISTERED_WRITERS } from "./registerWriter";

const useWriters = (
  subscription: string,
  environment: Environment,
  router: RoutingContext<Queries>,
  sessionRef: MutableRefObject<Session>
) => {
  useSession((key, value) => {
    if (
      env().VITE_NO_STATE &&
      !["fieldVisibilityStage", "modalSelector"].includes(key)
    ) {
      return;
    }

    const writer = REGISTERED_WRITERS[key];

    if (!writer) {
      throw new Error(`writer "${key}" is not registered`);
    }

    writer({ environment, router, sessionRef, subscription })(value);
  }, sessionRef.current);
};

export default useWriters;

import { Session, useSession } from "@fiftyone/state";
import { env } from "@fiftyone/utilities";
import { MutableRefObject } from "react";
import { Environment } from "react-relay";
import { Queries } from "../makeRoutes";
import { RoutingContext } from "../routing";
import { REGISTERED_WRITERS } from "./registerWriter";

const useWriters = (
  subscription: string,
  environment: Environment,
  router: RoutingContext<Queries>,
  sessionRef: MutableRefObject<Session>
) => {
  useSession((key, value) => {
    if (env().VITE_NO_STATE && key !== "selectedFields") {
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

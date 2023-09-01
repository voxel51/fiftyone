import { snakeCase } from "lodash";
import { useCallback, useMemo } from "react";
import { Queries } from "../makeRoutes";
import { RoutingContext } from "../routing";
import { EVENTS } from "./registerEvent";

const HANDLERS = {};

const useEvents = (
  router: RoutingContext<Queries>,
  controller: AbortController
) => {
  const eventNames = useMemo(() => Object.keys(EVENTS), []);
  const subscriptions = useMemo(() => eventNames.map(snakeCase), [eventNames]);

  const ctx = useMemo(() => ({ router, controller }), [router, controller]);
  for (let index = 0; index < eventNames.length; index++) {
    HANDLERS[eventNames[index]] = EVENTS[eventNames[index]](ctx);
  }

  return {
    subscriptions,
    handler: useCallback(
      (event: string, payload: unknown) => HANDLERS[event](payload),
      []
    ),
  };
};

export default useEvents;

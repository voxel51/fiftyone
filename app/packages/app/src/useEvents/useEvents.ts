import type { Session } from "@fiftyone/state";
import { snakeCase } from "lodash";
import { type MutableRefObject, useCallback, useMemo } from "react";
import type { Queries } from "../makeRoutes";
import type { RoutingContext } from "../routing";
import { type AppReadyState, EVENTS } from "./registerEvent";

const HANDLERS = {};

const IGNORE = new Set(["ping", ""]);

const useEvents = (
  controller: AbortController,
  router: RoutingContext<Queries>,
  readyStateRef: MutableRefObject<AppReadyState>,
  session: MutableRefObject<Session>
) => {
  const eventNames = useMemo(() => Object.keys(EVENTS), []);
  const subscriptions = useMemo(() => eventNames.map(snakeCase), [eventNames]);

  const ctx = useMemo(
    () => ({ controller, router, readyStateRef, session }),
    [controller, router, readyStateRef, session]
  );
  for (let index = 0; index < eventNames.length; index++) {
    HANDLERS[eventNames[index]] = EVENTS[eventNames[index]](ctx);
  }

  return {
    subscriptions,
    handler: useCallback((event: string, payload: string) => {
      if (IGNORE.has(event)) {
        return;
      }

      if (!HANDLERS[event]) {
        console.warn(`event "${event}" is not registered`);
        return;
      }

      HANDLERS[event](JSON.parse(payload));
    }, []),
  };
};

export default useEvents;

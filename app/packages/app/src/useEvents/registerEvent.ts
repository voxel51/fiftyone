import { Session } from "@fiftyone/state";
import { snakeCase } from "lodash";
import { MutableRefObject } from "react";
import { Queries } from "../makeRoutes";
import { RoutingContext } from "../routing";

export enum AppReadyState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSED = 2,
}

type EventContext = {
  controller: AbortController;
  router: RoutingContext<Queries>;
  readyStateRef: MutableRefObject<AppReadyState>;
  session: MutableRefObject<Session>;
};

export type EventHandlerHook = (ctx: EventContext) => (payload) => void;

export const EVENTS: {
  [event: string]: EventHandlerHook;
} = {};

export default (event: string, hook: EventHandlerHook) => {
  EVENTS[snakeCase(event)] = hook;
};

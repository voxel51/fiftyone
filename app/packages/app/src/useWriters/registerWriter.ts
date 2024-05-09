import { Session } from "@fiftyone/state";
import { MutableRefObject } from "react";
import { Environment } from "react-relay";
import { Queries } from "../makeRoutes";
import { RoutingContext } from "../routing";

type WriterKeys = keyof Omit<
  Session,
  | "canAddSidebarGroup"
  | "canCreateNewField"
  | "canTagSamples"
  | "canEditCustomColors"
  | "canEditSavedViews"
  | "readOnly"
>;

type WriterContext = {
  environment: Environment;
  router: RoutingContext<Queries>;
  sessionRef: MutableRefObject<Session>;
  subscription: string;
};

export type RegisteredWriter<K extends WriterKeys> = (
  ctx: WriterContext
) => (value: Session[K]) => void;

export const REGISTERED_WRITERS: {
  [K in WriterKeys]?: RegisteredWriter<K>;
} = {};

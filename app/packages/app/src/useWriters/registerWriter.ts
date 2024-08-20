import type { Session } from "@fiftyone/state";
import type { MutableRefObject } from "react";
import type { Environment } from "react-relay";
import type { Queries } from "../makeRoutes";
import type { RoutingContext } from "../routing";

type WriterKeys = keyof Omit<
  Session,
  | "canModifySidebarGroup"
  | "canCreateNewField"
  | "canTagSamplesOrLabels"
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

/**
 * The binding agent: the single top hook the view renders from.
 *
 * Composes the scoped hooks and hands the component one object, so the
 * component holds no state of its own and every seam below is injectable.
 */

import { useCallback, useMemo } from "react";

import {
  CloudPanelProps,
  CloudPanelSchemaView,
  ConnectionData,
  PushData,
} from "../types";
import { useAppBindings } from "./appBindings";
import { Connection, useConnection } from "./useConnection";
import { Pairing, usePairing } from "./usePairing";
import { Push, usePush } from "./usePush";
import { usePanelMethods } from "./usePanelMethods";

export interface CloudPanelActions {
  /** Starts pairing on the drafted URLs. */
  connect(): Promise<void>;
  pairing: Pick<Pairing, "retry" | "cancel"> & { isStarting: boolean };
  disconnect(): Promise<void>;
}

export interface CloudPanel {
  connection: ConnectionData;
  form: Connection["form"];
  push: PushData;
  pushActions: Omit<Push, "push">;
  actions: CloudPanelActions;
}

/** The view a cold panel renders before Python's first `render()` lands. */
const EMPTY_VIEW: CloudPanelSchemaView = {
  start_pairing: "",
  poll_pairing: "",
  cancel_pairing: "",
  disconnect: "",
  reset_push: "",
  local_dataset: "",
  dataset_count: 0,
  view_count: 0,
  has_view: false,
};

export function useCloudPanel(props: CloudPanelProps): CloudPanel {
  const data = props.data ?? {};
  const view = props.schema?.view ?? EMPTY_VIEW;

  const bindings = useAppBindings();
  const methods = usePanelMethods(view, bindings.trigger);
  const { connection, form } = useConnection(data);
  const pairing = usePairing(methods, connection.status);
  const { push, ...pushActions } = usePush(
    data,
    view,
    methods.resetPush,
    bindings,
  );

  const connect = useCallback(
    // The drafted URLs, not the ones in panel data — the user may have just
    // edited them behind Advanced.
    () => pairing.begin({ api_url: form.apiUrl, auth_url: form.authUrl }),
    [form.apiUrl, form.authUrl, pairing],
  );

  const actions = useMemo<CloudPanelActions>(
    () => ({
      connect,
      pairing: {
        retry: pairing.retry,
        cancel: pairing.cancel,
        isStarting: pairing.isStarting,
      },
      disconnect: methods.disconnect,
    }),
    [connect, methods.disconnect, pairing],
  );

  return { connection, form, push, pushActions, actions };
}

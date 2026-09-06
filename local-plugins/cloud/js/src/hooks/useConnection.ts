/**
 * The connection half of panel data, plus the form state that sits on top
 * of it.
 *
 * The URLs are editable before a pairing starts, so the hook keeps a local
 * draft seeded from panel data and re-seeds it whenever Python rewrites the
 * connection (Disconnect, a failed pairing). "Advanced" auto-expands only
 * when neither URL resolved to anything — nothing in the environment, no
 * stored profile, and no default.
 */

import { useEffect, useMemo, useState } from "react";

import { ConnectionData, ConnectionStatus, PanelData } from "../types";

export interface ConnectionForm {
  apiUrl: string;
  authUrl: string;
  setApiUrl(value: string): void;
  setAuthUrl(value: string): void;
  /** True when both resolved empty — the only case that opens Advanced. */
  advancedOpenByDefault: boolean;
  /** Both URLs non-empty; gates the Connect button. */
  canConnect: boolean;
}

export interface Connection {
  connection: ConnectionData;
  form: ConnectionForm;
}

/** What the panel shows before `on_load` has landed: a valid empty state. */
const DISCONNECTED: ConnectionData = {
  status: ConnectionStatus.Disconnected,
  api_url: "",
  auth_url: "",
};

export function useConnection(data: PanelData): Connection {
  const connection = data.connection ?? DISCONNECTED;
  const { api_url: resolvedApi, auth_url: resolvedAuth } = connection;

  const [apiUrl, setApiUrl] = useState(resolvedApi);
  const [authUrl, setAuthUrl] = useState(resolvedAuth);

  // Python owns the resolution chain (env, then stored profile, then
  // defaults); every rewrite of it wins over an untouched draft.
  useEffect(() => {
    setApiUrl(resolvedApi);
  }, [resolvedApi]);
  useEffect(() => {
    setAuthUrl(resolvedAuth);
  }, [resolvedAuth]);

  const form = useMemo<ConnectionForm>(
    () => ({
      apiUrl,
      authUrl,
      setApiUrl,
      setAuthUrl,
      advancedOpenByDefault: !resolvedApi && !resolvedAuth,
      canConnect: apiUrl.trim().length > 0 && authUrl.trim().length > 0,
    }),
    [apiUrl, authUrl, resolvedApi, resolvedAuth],
  );

  return { connection, form };
}

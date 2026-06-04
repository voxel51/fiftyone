import { useEffect, useMemo } from "react";
import {
  createMcapResourceClient,
  type CreateMcapResourceClientOptions,
} from "../resource-client";
import type { McapResourceClient } from "../types";

/**
 * Options for creating an MCAP resource client in React renderers.
 */
export type UseMcapResourceClientOptions = Pick<
  CreateMcapResourceClientOptions,
  "worker"
>;

/**
 * Creates the MCAP resource client for React renderers and owns cleanup.
 */
export function useMcapResourceClient(
  options: UseMcapResourceClientOptions = {}
): McapResourceClient {
  const { worker = false } = options;
  const client = useMemo(() => createMcapResourceClient({ worker }), [worker]);

  useEffect(() => {
    return () => {
      client.dispose();
    };
  }, [client]);

  return client;
}

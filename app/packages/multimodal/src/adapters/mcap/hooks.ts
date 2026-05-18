import { useEffect, useMemo } from "react";
import { createWorkerMcapResourceClient } from "./worker";
import type { McapResourceClient } from "./types";

/**
 * Creates the worker-backed MCAP resource client for React renderers and owns
 * cleanup.
 */
export function useMcapResourceClient(): McapResourceClient {
  const client = useMemo(() => createWorkerMcapResourceClient(), []);

  useEffect(() => {
    return () => {
      client.dispose();
    };
  }, [client]);

  return client;
}

import { useEffect, useMemo } from "react";
import {
  acquireSharedMcapResourceClient,
  createMcapResourceClient,
  type CreateMcapResourceClientOptions,
} from "../resource-client";
import type { McapResourceClient } from "../types";

/**
 * Options for creating an MCAP resource client in React renderers.
 */
export type UseMcapResourceClientOptions = Pick<
  CreateMcapResourceClientOptions,
  "byteClient" | "worker"
>;

/**
 * Provides the shared MCAP resource client for React renderers. Sample
 * navigation remounts the renderer per sample, so ownership is ref-counted:
 * the worker fleet and its warm readers survive next-sample hops instead of
 * respawning per mount.
 */
export function useMcapResourceClient(
  options: UseMcapResourceClientOptions = {},
): McapResourceClient {
  const { byteClient, worker = false } = options;
  const handle = useMemo(() => {
    if (byteClient) {
      const client = createMcapResourceClient({ byteClient, worker });
      return {
        client,
        release: () => client.dispose(),
      };
    }

    return acquireSharedMcapResourceClient({ worker });
  }, [byteClient, worker]);

  useEffect(() => {
    return () => {
      handle.release();
    };
  }, [handle]);

  return handle.client;
}

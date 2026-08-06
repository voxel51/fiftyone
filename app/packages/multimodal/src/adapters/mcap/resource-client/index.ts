import { createInlineMcapResourceClient } from "./inline-client";
import type { ByteClient } from "../../../query/bytes/index";
import type { McapResourceClient } from "../contracts/index";
import { createWorkerMcapResourceClient } from "../worker/index";

/**
 * Options for constructing an MCAP resource client.
 */
export interface CreateMcapResourceClientOptions {
  /**
   * Custom byte reader for inline MCAP clients. Worker clients cannot receive
   * browser-owned resources like File objects, so this forces inline mode.
   */
  readonly byteClient?: ByteClient;

  /**
   * Run MCAP resource reads in a playback worker instead of the calling thread.
   */
  readonly worker?: boolean;
}

/**
 * Creates an MCAP resource client. Calls are inline by default and worker-backed
 * when requested.
 */
export function createMcapResourceClient(
  options: CreateMcapResourceClientOptions = {},
): McapResourceClient {
  if (options.byteClient) {
    return createInlineMcapResourceClient({ byteClient: options.byteClient });
  }

  if (options.worker === true) {
    return createWorkerMcapResourceClient();
  }

  return createInlineMcapResourceClient();
}

/**
 * Sample navigation remounts the modal renderer per sample. Ref-counted
 * sharing keeps one client coordinator across next-sample hops and quick grid
 * round trips, while the final release tears down its worker isolates so their
 * allocator high-water state cannot cross a renderer ownership boundary.
 */
const SHARED_CLIENT_LINGER_MS = 30_000;

interface SharedClientEntry {
  readonly client: McapResourceClient;
  disposeTimer: ReturnType<typeof setTimeout> | null;
  refs: number;
}

const sharedClients = new Map<string, SharedClientEntry>();

/**
 * Acquires the shared MCAP resource client for the given mode and returns a
 * release handle. Worker lanes stop as soon as every holder releases; the
 * client coordinator disposes only after the linger window passes without a
 * new acquire.
 */
export function acquireSharedMcapResourceClient(
  options: CreateMcapResourceClientOptions = {},
): { client: McapResourceClient; release: () => void } {
  if (options.byteClient) {
    const client = createMcapResourceClient(options);
    return {
      client,
      release: () => client.dispose(),
    };
  }

  const key = options.worker === true ? "worker" : "inline";
  let entry = sharedClients.get(key);
  if (!entry) {
    entry = {
      client: createMcapResourceClient(options),
      disposeTimer: null,
      refs: 0,
    };
    sharedClients.set(key, entry);
  }
  if (entry.disposeTimer !== null) {
    clearTimeout(entry.disposeTimer);
    entry.disposeTimer = null;
  }
  entry.refs += 1;

  const held = entry;
  let released = false;
  return {
    client: held.client,
    release: () => {
      if (released) {
        return;
      }
      released = true;
      held.refs -= 1;
      if (held.refs > 0) {
        return;
      }
      // End every worker isolate at the renderer ownership boundary. Clearing
      // its JavaScript caches is insufficient because V8/backing-store
      // allocators may retain the previous recording's committed high-water
      // state for the life of the worker.
      held.client.releaseRetainedResources?.();
      held.disposeTimer = setTimeout(() => {
        if (held.refs === 0 && sharedClients.get(key) === held) {
          sharedClients.delete(key);
          held.client.dispose();
        }
      }, SHARED_CLIENT_LINGER_MS);
    },
  };
}

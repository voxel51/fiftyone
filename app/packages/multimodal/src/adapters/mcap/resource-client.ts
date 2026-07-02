import { createInlineMcapResourceClient } from "./resources";
import type { McapResourceClient } from "./types";
import { createWorkerMcapResourceClient } from "./worker";

/**
 * Options for constructing an MCAP resource client.
 */
export interface CreateMcapResourceClientOptions {
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
  if (options.worker === true) {
    return createWorkerMcapResourceClient();
  }

  return createInlineMcapResourceClient();
}

/**
 * Sample navigation remounts the modal renderer per sample, and worker
 * respawn (module eval, WASM decompress handlers, reader init) is the
 * dominant per-navigation cost. Ref-counted sharing with a linger window
 * keeps one fleet alive across next-sample hops and quick grid round trips.
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
 * release handle. The client disposes only after every holder released it
 * and the linger window passed without a new acquire.
 */
export function acquireSharedMcapResourceClient(
  options: CreateMcapResourceClientOptions = {},
): { client: McapResourceClient; release: () => void } {
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
      held.disposeTimer = setTimeout(() => {
        if (held.refs === 0 && sharedClients.get(key) === held) {
          sharedClients.delete(key);
          held.client.dispose();
        }
      }, SHARED_CLIENT_LINGER_MS);
    },
  };
}

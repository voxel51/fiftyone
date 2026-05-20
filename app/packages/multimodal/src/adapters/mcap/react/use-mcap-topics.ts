import { LRUCache } from "lru-cache";
import { useEffect, useMemo, useState } from "react";
import {
  byteSourceCacheKey,
  type ByteSourceDescriptor,
} from "../../../query/bytes";
import type { StreamInventory } from "../../../schemas/v1";
import { mcapErrorMessage } from "../errors";
import type { McapResourceClient } from "../types";

export type McapTopicsStatus = "idle" | "loading" | "ready" | "error";

export interface McapTopicsState {
  readonly error: string | null;
  readonly status: McapTopicsStatus;
  readonly topics: readonly StreamInventory[];
}

export interface UseMcapTopicsOptions {
  readonly client: McapResourceClient;
  readonly source: ByteSourceDescriptor | null;
}

type McapTopicsCacheEntry = {
  readonly promise: Promise<readonly StreamInventory[]>;
  topics?: readonly StreamInventory[];
};

// Metadata-only source cache. Topic summaries are small, source-keyed, and safe
// to share across grid/modal renderers without pinning decoded frame payloads.
const MCAP_TOPICS_CACHE_MAX_SOURCES = 128;
const mcapTopicsCache = new LRUCache<string, McapTopicsCacheEntry>({
  max: MCAP_TOPICS_CACHE_MAX_SOURCES,
});

const IDLE_TOPICS_STATE: McapTopicsState = {
  error: null,
  status: "idle",
  topics: [],
};

/**
 * Loads MCAP topic inventory through the adapter resource client.
 */
export function useMcapTopics({
  client,
  source,
}: UseMcapTopicsOptions): McapTopicsState {
  const sourceKey = useMemo(
    () => (source ? byteSourceCacheKey(source) : ""),
    [source]
  );
  const [state, setState] = useState<McapTopicsState>(IDLE_TOPICS_STATE);

  useEffect(() => {
    if (!source) {
      setState(IDLE_TOPICS_STATE);
      return;
    }

    const entry = topicsCacheEntry(client, source, sourceKey);
    if (entry.topics) {
      setState({
        error: null,
        status: "ready",
        topics: entry.topics,
      });
      return;
    }

    let active = true;
    setState({
      error: null,
      status: "loading",
      topics: [],
    });

    entry.promise
      .then((topics) => {
        if (!active) {
          return;
        }

        setState({
          error: null,
          status: "ready",
          topics,
        });
      })
      .catch((caughtError) => {
        if (!active) {
          return;
        }

        setState({
          error: mcapErrorMessage(caughtError),
          status: "error",
          topics: [],
        });
      });

    return () => {
      active = false;
    };
  }, [client, source, sourceKey]);

  return state;
}

function topicsCacheEntry(
  client: McapResourceClient,
  source: ByteSourceDescriptor,
  sourceKey: string
): McapTopicsCacheEntry {
  const cached = mcapTopicsCache.get(sourceKey);
  if (cached) {
    return cached;
  }

  const entry: McapTopicsCacheEntry = {
    promise: client
      .readTopics({ source })
      .then((topics) => {
        const cachedEntry = mcapTopicsCache.get(sourceKey);
        if (cachedEntry) {
          cachedEntry.topics = topics;
        }
        return topics;
      })
      .catch((error) => {
        mcapTopicsCache.delete(sourceKey);
        throw error;
      }),
  };
  mcapTopicsCache.set(sourceKey, entry);

  return entry;
}

import { useEffect, useState } from "react";
import type { ByteSourceDescriptor } from "../../../query/bytes";
import type { StreamInventory } from "../../../schemas/v1";
import type { LoadStatus } from "../../../load-status";
import { mcapErrorMessage } from "../errors";
import type { McapResourceClient } from "../types";

export type McapTopicsStatus = LoadStatus;

export interface McapTopicsState {
  readonly error: string | null;
  readonly status: McapTopicsStatus;
  readonly topics: readonly StreamInventory[];
}

export interface UseMcapTopicsOptions {
  readonly client: McapResourceClient;
  readonly source: ByteSourceDescriptor | null;
}

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
  const [state, setState] = useState<McapTopicsState>(IDLE_TOPICS_STATE);

  useEffect(() => {
    if (!source) {
      setState(IDLE_TOPICS_STATE);
      return;
    }

    let active = true;
    setState({
      error: null,
      status: "loading",
      topics: [],
    });

    client
      .readTopics({ source })
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
  }, [client, source]);

  return state;
}

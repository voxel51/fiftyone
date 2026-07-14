import { useEffect, useState } from "react";
import {
  byteSourceAccessKey,
  type ByteSourceDescriptor,
} from "../../../query/bytes";
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

const LOADING_TOPICS_STATE: McapTopicsState = {
  error: null,
  status: "loading",
  topics: [],
};

type SourcedTopicsState = {
  readonly sourceKey: string;
  readonly value: McapTopicsState;
};

/**
 * Loads MCAP topic inventory through the adapter resource client.
 */
export function useMcapTopics({
  client,
  source,
}: UseMcapTopicsOptions): McapTopicsState {
  const sourceKey = source ? byteSourceAccessKey(source) : "";
  const [state, setState] = useState<SourcedTopicsState>({
    sourceKey: "",
    value: IDLE_TOPICS_STATE,
  });

  useEffect(() => {
    if (!source) {
      setState({ sourceKey: "", value: IDLE_TOPICS_STATE });
      return;
    }

    const effectSourceKey = byteSourceAccessKey(source);
    let active = true;
    setState({ sourceKey: effectSourceKey, value: LOADING_TOPICS_STATE });

    client
      .readTopics({ source })
      .then((topics) => {
        if (!active) {
          return;
        }

        setState({
          sourceKey: effectSourceKey,
          value: { error: null, status: "ready", topics },
        });
      })
      .catch((caughtError) => {
        if (!active) {
          return;
        }

        setState({
          sourceKey: effectSourceKey,
          value: {
            error: mcapErrorMessage(caughtError),
            status: "error",
            topics: [],
          },
        });
      });

    return () => {
      active = false;
    };
  }, [client, source]);

  // A persistent renderer swaps sources in place, and state lags the swap
  // by one effect tick — report loading rather than leaking the previous
  // sample's inventory into that render.
  if (state.sourceKey !== sourceKey) {
    return source ? LOADING_TOPICS_STATE : IDLE_TOPICS_STATE;
  }

  return state.value;
}

import { useEffect, useState } from "react";
import {
  byteSourceAccessKey,
  type ByteSourceDescriptor,
} from "../../../query/bytes";
import type { StreamInventory } from "../../../schemas/v1";
import type { LoadStatus } from "../../../load-status";
import { mcapErrorMessage } from "../errors";
import {
  getMcapSourceBootstrap,
  peekMcapSourceBootstrap,
} from "../source-bootstrap-cache";
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
  const bootstrapTopics = source
    ? peekMcapSourceBootstrap(source)?.topics
    : undefined;
  const [state, setState] = useState<SourcedTopicsState>({
    sourceKey: "",
    value: IDLE_TOPICS_STATE,
  });

  // This effect revalidates cached inventory for the active source.
  useEffect(() => {
    if (!source) {
      setState({ sourceKey: "", value: IDLE_TOPICS_STATE });
      return undefined;
    }

    const effectSourceKey = byteSourceAccessKey(source);
    let active = true;
    const cachedTopics = getMcapSourceBootstrap(source)?.topics;
    setState({
      sourceKey: effectSourceKey,
      value: cachedTopics
        ? { error: null, status: "ready", topics: cachedTopics }
        : LOADING_TOPICS_STATE,
    });

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
    if (!source) {
      return IDLE_TOPICS_STATE;
    }
    return bootstrapTopics
      ? { error: null, status: "ready", topics: bootstrapTopics }
      : LOADING_TOPICS_STATE;
  }

  if (state.value.status === "loading" && bootstrapTopics) {
    return { error: null, status: "ready", topics: bootstrapTopics };
  }

  return state.value;
}

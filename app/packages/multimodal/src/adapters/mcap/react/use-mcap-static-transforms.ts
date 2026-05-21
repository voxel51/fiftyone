import { useEffect, useMemo, useState } from "react";
import {
  byteSourceCacheKey,
  type ByteSourceDescriptor,
} from "../../../query/bytes";
import { createMcapStaticTransformGraph } from "../frame-graph";
import { mcapErrorMessage } from "../errors";
import type { McapResourceClient, McapStaticTransformGraph } from "../types";

export type McapStaticTransformsStatus = "idle" | "loading" | "ready" | "error";

export interface McapStaticTransformsState {
  readonly error: string | null;
  readonly graph: McapStaticTransformGraph;
  readonly status: McapStaticTransformsStatus;
}

export interface UseMcapStaticTransformsOptions {
  readonly client: McapResourceClient;
  readonly source: ByteSourceDescriptor | null;
}

const EMPTY_STATIC_TRANSFORM_GRAPH = createMcapStaticTransformGraph({
  transforms: [],
});
const IDLE_STATIC_TRANSFORMS_STATE: McapStaticTransformsState = {
  error: null,
  graph: EMPTY_STATIC_TRANSFORM_GRAPH,
  status: "idle",
};

/**
 * Loads normalized `/tf_static` frame transforms through the MCAP resource client.
 */
export function useMcapStaticTransforms({
  client,
  source,
}: UseMcapStaticTransformsOptions): McapStaticTransformsState {
  const sourceKey = useMemo(
    () => (source ? byteSourceCacheKey(source) : ""),
    [source]
  );
  const [state, setState] = useState<McapStaticTransformsState>(
    IDLE_STATIC_TRANSFORMS_STATE
  );

  useEffect(() => {
    if (!source) {
      setState(IDLE_STATIC_TRANSFORMS_STATE);
      return;
    }

    let active = true;
    setState({
      error: null,
      graph: EMPTY_STATIC_TRANSFORM_GRAPH,
      status: "loading",
    });

    client
      .readStaticTransforms({ source })
      .then((graph) => {
        if (!active) {
          return;
        }

        setState({
          error: null,
          graph,
          status: "ready",
        });
      })
      .catch((caughtError) => {
        if (!active) {
          return;
        }

        setState({
          error: mcapErrorMessage(caughtError),
          graph: EMPTY_STATIC_TRANSFORM_GRAPH,
          status: "error",
        });
      });

    return () => {
      active = false;
    };
  }, [client, source, sourceKey]);

  return state;
}

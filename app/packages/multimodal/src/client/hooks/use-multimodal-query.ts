import { useEffect, useState } from "react";
import type { MultimodalQueryState } from "./types";

const IDLE_STATE = { data: null, error: null, status: "idle" } as const;
const LOADING_STATE = { data: null, error: null, status: "loading" } as const;

function normalizeError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error(typeof error === "string" ? error : "Unknown error");
}

/**
 * Runs one nullable async multimodal query and guards against stale updates.
 */
export function useMultimodalQuery<Data>(
  load: (() => Promise<Data>) | null
): MultimodalQueryState<Data> {
  const [state, setState] = useState<MultimodalQueryState<Data>>(IDLE_STATE);

  useEffect(() => {
    if (!load) {
      setState(IDLE_STATE);
      return;
    }

    let active = true;
    setState(LOADING_STATE);

    load()
      .then((data) => {
        if (active) {
          setState({ data, error: null, status: "loaded" });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            data: null,
            error: normalizeError(error),
            status: "error",
          });
        }
      });

    return () => {
      active = false;
    };
  }, [load]);

  return state;
}

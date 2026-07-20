import { useEffect, useMemo, useState } from "react";

import type { EpisodeSession, EpisodeSource, SampleDescriptor } from "../ports";
import { createDefaultByteClient } from "../query/bytes";
import { loadFormatAdapter } from "../runtime";

export type EpisodeSessionState =
  | { readonly error: null; readonly session: null; readonly status: "idle" }
  | { readonly error: null; readonly session: null; readonly status: "loading" }
  | {
      readonly error: string;
      readonly session: null;
      readonly status: "error";
    }
  | {
      readonly error: null;
      readonly session: EpisodeSession;
      readonly status: "ready";
    };

/** Detects, loads, and owns one format-neutral episode session. */
export function useEpisodeSession(
  sample: SampleDescriptor,
  source: EpisodeSource | null,
): EpisodeSessionState {
  const io = useMemo(() => createDefaultByteClient(), []);
  const [state, setState] = useState<EpisodeSessionState>({
    error: null,
    session: null,
    status: "idle",
  });

  useEffect(() => {
    if (!source) {
      setState({ error: null, session: null, status: "idle" });
      return undefined;
    }
    let active = true;
    let opened: EpisodeSession | null = null;
    setState({ error: null, session: null, status: "loading" });
    void loadFormatAdapter(sample)
      .then(async (adapter) => {
        if (!adapter)
          throw new Error("No episode adapter recognized this sample");
        const session = await adapter.open(source, io);
        if (!active) {
          session.dispose();
          return;
        }
        opened = session;
        session.activate?.();
        setState({ error: null, session, status: "ready" });
      })
      .catch((error) => {
        if (!active) return;
        setState({
          error: error instanceof Error ? error.message : String(error),
          session: null,
          status: "error",
        });
      });
    return () => {
      active = false;
      opened?.dispose();
    };
  }, [io, sample.mediaType, sample.path, source]);

  return state;
}

import { useEffect, useState } from "react";

import type {
  EpisodeSession,
  EpisodeSource,
  SampleDescriptor,
} from "../../ports";
import { openEpisodeSession } from "../../runtime";

/** Lifecycle state for a lazily detected episode session. */
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
  const [state, setState] = useState<EpisodeSessionState>({
    error: null,
    session: null,
    status: "idle",
  });
  const { mediaType, path } = sample;

  // This effect detects and owns the session for the current source.
  useEffect(() => {
    if (!source) {
      setState({ error: null, session: null, status: "idle" });
      return undefined;
    }
    let active = true;
    let opened: EpisodeSession | null = null;
    setState({ error: null, session: null, status: "loading" });
    void openEpisodeSession({ mediaType, path }, source)
      .then((session) => {
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
  }, [mediaType, path, source]);

  return state;
}

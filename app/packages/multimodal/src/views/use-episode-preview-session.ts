import { useEffect, useMemo, useState } from "react";

import type {
  EpisodePreviewSession,
  EpisodeSource,
  SampleDescriptor,
} from "../ports";
import { createDefaultByteClient } from "../query/bytes";
import { loadFormatAdapter } from "../runtime";

/** Lifecycle state for a lazily detected lightweight preview session. */
export type EpisodePreviewSessionState =
  | { readonly error: null; readonly session: null; readonly status: "idle" }
  | {
      readonly error: null;
      readonly session: null;
      readonly status: "loading";
    }
  | {
      readonly error: null;
      readonly session: null;
      readonly status: "unavailable";
    }
  | {
      readonly error: string;
      readonly session: null;
      readonly status: "error";
    }
  | {
      readonly error: null;
      readonly session: EpisodePreviewSession;
      readonly status: "ready";
    };

/** Detects, opens, and owns a format-neutral lightweight preview session. */
export function useEpisodePreviewSession(
  sample: SampleDescriptor,
  source: EpisodeSource | null,
  enabled: boolean,
): EpisodePreviewSessionState {
  const io = useMemo(() => createDefaultByteClient(), []);
  const [state, setState] = useState<EpisodePreviewSessionState>({
    error: null,
    session: null,
    status: "idle",
  });
  const { mediaType, path } = sample;

  // This effect detects and owns the preview session while the tile is active.
  useEffect(() => {
    if (!enabled || !source) {
      setState({ error: null, session: null, status: "idle" });
      return undefined;
    }
    let active = true;
    let opened: EpisodePreviewSession | null = null;
    setState({ error: null, session: null, status: "loading" });
    void loadFormatAdapter({ mediaType, path })
      .then(async (adapter) => {
        if (!adapter?.openPreview) {
          if (active) {
            setState({
              error: null,
              session: null,
              status: "unavailable",
            });
          }
          return;
        }
        const session = await adapter.openPreview(source, io);
        if (!active) {
          session.dispose();
          return;
        }
        opened = session;
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
  }, [enabled, io, mediaType, path, source]);

  return state;
}

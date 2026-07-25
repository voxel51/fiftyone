import { useEffect, useRef, useState } from "react";

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

interface OwnedEpisodeSessionState {
  readonly mediaType: string | undefined;
  readonly path: string | undefined;
  readonly source: EpisodeSource | null;
  readonly value: EpisodeSessionState;
}

/** Detects, loads, and owns one format-neutral episode session. */
export function useEpisodeSession(
  sample: SampleDescriptor,
  source: EpisodeSource | null,
): EpisodeSessionState {
  const { mediaType, path } = sample;
  const liveSessionRef = useRef<EpisodeSession | null>(null);
  const [ownedState, setOwnedState] = useState<OwnedEpisodeSessionState>(
    () => ({
      mediaType,
      path,
      source,
      value: {
        error: null,
        session: null,
        status: source ? "loading" : "idle",
      },
    }),
  );

  // This effect detects and owns the session for the current source.
  useEffect(() => {
    if (!source) {
      setOwnedState({
        mediaType,
        path,
        source,
        value: { error: null, session: null, status: "idle" },
      });
      return undefined;
    }
    let active = true;
    let opened: EpisodeSession | null = null;
    const controller = new AbortController();
    setOwnedState({
      mediaType,
      path,
      source,
      value: { error: null, session: null, status: "loading" },
    });
    void openEpisodeSession({ mediaType, path }, source, {
      signal: controller.signal,
    })
      .then((session) => {
        if (!active) {
          session.dispose();
          return;
        }
        opened = session;
        liveSessionRef.current = session;
        session.activate?.();
        setOwnedState({
          mediaType,
          path,
          source,
          value: { error: null, session, status: "ready" },
        });
      })
      .catch((error) => {
        if (!active) return;
        if (opened) {
          if (liveSessionRef.current === opened) {
            liveSessionRef.current = null;
          }
          opened.dispose();
          opened = null;
        }
        setOwnedState({
          mediaType,
          path,
          source,
          value: {
            error: error instanceof Error ? error.message : String(error),
            session: null,
            status: "error",
          },
        });
      });
    return () => {
      active = false;
      controller.abort();
      if (opened) {
        if (liveSessionRef.current === opened) {
          liveSessionRef.current = null;
        }
        opened.dispose();
      }
    };
  }, [mediaType, path, source]);

  // Effects clean up the previous request after the next render starts. Derive
  // ownership here so that render can never publish that stale session, and
  // verify liveness in case cleanup ran before its loading update committed.
  const ownsCurrentRequest =
    ownedState.mediaType === mediaType &&
    ownedState.path === path &&
    ownedState.source === source;
  if (!ownsCurrentRequest) {
    return {
      error: null,
      session: null,
      status: source ? "loading" : "idle",
    };
  }
  if (
    ownedState.value.status === "ready" &&
    liveSessionRef.current !== ownedState.value.session
  ) {
    return { error: null, session: null, status: "loading" };
  }
  return ownedState.value;
}

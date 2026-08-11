import type {
  EpisodeSession,
  EpisodeSource,
  SampleDescriptor,
} from "../../ports";
import { openEpisodeSession } from "../../runtime";
import {
  useOwnedEpisodeResource,
  type OwnedEpisodeResourceLifecycle,
} from "./use-owned-episode-resource";

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

const EPISODE_SESSION_LIFECYCLE: OwnedEpisodeResourceLifecycle<
  EpisodeSession,
  EpisodeSessionState
> = {
  activate: (session) => session.activate?.(),
  error: (error) => ({ error, session: null, status: "error" }),
  idle: { error: null, session: null, status: "idle" },
  loading: { error: null, session: null, status: "loading" },
  open: openEpisodeSession,
  ready: (session) => ({ error: null, session, status: "ready" }),
};

/** Detects, loads, and owns one format-neutral episode session. */
export function useEpisodeSession(
  sample: SampleDescriptor,
  source: EpisodeSource | null,
): EpisodeSessionState {
  return useOwnedEpisodeResource(
    sample,
    source,
    true,
    EPISODE_SESSION_LIFECYCLE,
  );
}

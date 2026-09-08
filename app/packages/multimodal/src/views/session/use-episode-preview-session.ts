import type {
  EpisodePreviewSession,
  EpisodeSource,
  SampleDescriptor,
} from "../../ports";
import { openEpisodePreviewSession } from "../../runtime";
import {
  useOwnedEpisodeResource,
  type OwnedEpisodeResourceLifecycle,
} from "./use-owned-episode-resource";

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

const EPISODE_PREVIEW_SESSION_LIFECYCLE: OwnedEpisodeResourceLifecycle<
  EpisodePreviewSession,
  EpisodePreviewSessionState
> = {
  error: (error) => ({ error, session: null, status: "error" }),
  idle: { error: null, session: null, status: "idle" },
  loading: { error: null, session: null, status: "loading" },
  open: openEpisodePreviewSession,
  ready: (session) => ({ error: null, session, status: "ready" }),
  unavailable: { error: null, session: null, status: "unavailable" },
};

/** Detects, opens, and owns a format-neutral lightweight preview session. */
export function useEpisodePreviewSession(
  sample: SampleDescriptor,
  source: EpisodeSource | null,
  enabled: boolean,
): EpisodePreviewSessionState {
  return useOwnedEpisodeResource(
    sample,
    source,
    enabled,
    EPISODE_PREVIEW_SESSION_LIFECYCLE,
  );
}

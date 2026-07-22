import type { StreamDescriptor } from "../../../ir/index";
import type { EpisodeSession } from "../../../ports/index";
import type { LoadStatus } from "../../../runtime/index";

export type EpisodeStreamsStatus = LoadStatus;

export interface EpisodeStreamsState {
  readonly error: string | null;
  readonly status: EpisodeStreamsStatus;
  readonly streams: readonly StreamDescriptor[];
}

export interface UseEpisodeStreamsOptions {
  readonly error?: string | null;
  readonly session: EpisodeSession | null;
  readonly sourceAvailable: boolean;
}

/** Exposes the format-neutral stream descriptors from the active session. */
export function useEpisodeStreams({
  error = null,
  session,
  sourceAvailable,
}: UseEpisodeStreamsOptions): EpisodeStreamsState {
  if (error) return { error, status: "error", streams: [] };
  if (!sourceAvailable) return { error: null, status: "idle", streams: [] };
  if (!session) return { error: null, status: "loading", streams: [] };
  return {
    error: null,
    status: "ready",
    streams: session.manifest.streams,
  };
}

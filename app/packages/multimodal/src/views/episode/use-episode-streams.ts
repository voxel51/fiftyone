import type { StreamDescriptor } from "../../ir";
import type { EpisodeSession } from "../../ports";
import type { StreamInventory } from "../../schemas/v1";
import type { LoadStatus } from "../../runtime";

export type EpisodeStreamsStatus = LoadStatus;

export interface EpisodeStreamsState {
  readonly error: string | null;
  readonly status: EpisodeStreamsStatus;
  readonly streams: readonly StreamInventory[];
}

export interface UseEpisodeStreamsOptions {
  readonly error?: string | null;
  readonly session: EpisodeSession | null;
  readonly sourceAvailable: boolean;
}

/** Projects the session manifest into the generated inventory view model. */
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
    streams: manifestStreams(session.manifest.streams),
  };
}

function manifestStreams(
  streams: readonly StreamDescriptor[],
): readonly StreamInventory[] {
  return streams.map((stream) => ({
    $typeName: "fiftyone.multimodal.schemas.v1.StreamInventory" as const,
    displayName: stream.sourceName,
    metadata: { ...stream.metadata },
    payload: {
      $typeName: "fiftyone.multimodal.schemas.v1.PayloadDescriptor" as const,
      encoding: stream.payload.encoding,
      schema: stream.payload.schema ?? "",
      schemaEncoding: stream.payload.schemaEncoding ?? "",
    },
    recordCount: stream.count?.toString(),
    streamId: stream.id,
  }));
}

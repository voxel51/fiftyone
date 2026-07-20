import { useCallback } from "react";
import type { DecodedFrame } from "../../ir";
import {
  EpisodeDataStreamProvider as RuntimeEpisodeDataStreamProvider,
  useEpisodeDataStream as useRuntimeEpisodeDataStream,
  useSetEpisodeDataStream as useSetRuntimeEpisodeDataStream,
  type AnyEpisodeDataStream,
  type TimelineIndex,
} from "../../runtime";
import type { EpisodeStreamCache } from "./episode-stream-cache";

/** @deprecated episode-shaped compatibility view of the shared data stream. */
export interface EpisodeDataStream {
  readonly sourceKey: string;
  readonly subscribeToStream: (stream: string) => () => void;
  readonly getStreamCache: (stream: string) => EpisodeStreamCache | undefined;
  readonly getTimelineIndex: () => TimelineIndex | null;
  readonly readStreamMessages?: (request: {
    readonly endTimeNs: bigint;
    readonly startTimeNs: bigint;
    readonly stream: string;
  }) => Promise<readonly DecodedFrame[]>;
}

interface EpisodeCompatibilityDataStream extends AnyEpisodeDataStream {
  readonly format: "episode";
  readonly legacy: EpisodeDataStream;
}

/** Compatibility alias over the shared episode provider. */
export const EpisodeDataStreamProvider = RuntimeEpisodeDataStreamProvider;

/** @deprecated Compatibility hook for the legacy episode view shell. */
export function useEpisodeDataStream(): EpisodeDataStream | null {
  const stream = useRuntimeEpisodeDataStream();
  return stream && isEpisodeCompatibilityDataStream(stream)
    ? stream.legacy
    : null;
}

/** @deprecated Compatibility hook for the legacy episode view shell. */
export function useSetEpisodeDataStream(): (
  next: EpisodeDataStream | null,
) => void {
  const setEpisodeDataStream = useSetRuntimeEpisodeDataStream();
  return useCallback(
    (next: EpisodeDataStream | null) => {
      setEpisodeDataStream(next ? toEpisodeDataStream(next) : null);
    },
    [setEpisodeDataStream],
  );
}

function toEpisodeDataStream(
  stream: EpisodeDataStream,
): EpisodeCompatibilityDataStream {
  return {
    format: "episode",
    getStreamCache: stream.getStreamCache,
    getTimelineIndex: stream.getTimelineIndex,
    legacy: stream,
    ...(stream.readStreamMessages
      ? {
          readStreamFrames: ({ endTimeNs, startTimeNs, stream: streamId }) =>
            stream.readStreamMessages?.({
              endTimeNs,
              startTimeNs,
              stream: streamId,
            }) ?? Promise.resolve([]),
        }
      : {}),
    sourceKey: stream.sourceKey,
    subscribeToStream: stream.subscribeToStream,
  };
}

function isEpisodeCompatibilityDataStream(
  stream: AnyEpisodeDataStream,
): stream is EpisodeCompatibilityDataStream {
  return (
    "format" in stream &&
    stream.format === "episode" &&
    "legacy" in stream &&
    typeof stream.legacy === "object" &&
    stream.legacy !== null
  );
}

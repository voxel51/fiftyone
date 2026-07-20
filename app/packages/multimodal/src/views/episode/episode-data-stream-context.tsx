import type { DecodedFrame } from "../../ir";
import {
  EpisodeDataStreamProvider as RuntimeEpisodeDataStreamProvider,
  useEpisodeDataStream as useRuntimeEpisodeDataStream,
  useSetEpisodeDataStream as useSetRuntimeEpisodeDataStream,
  type EpisodeDataStream as RuntimeEpisodeDataStream,
} from "../../runtime";
import type { EpisodeStreamCache } from "./episode-stream-cache";

/** Episode renderer specialization of the shared runtime data stream. */
export type EpisodeDataStream = RuntimeEpisodeDataStream<
  DecodedFrame,
  EpisodeStreamCache
>;

/** Shared provider used by the episode renderer shell. */
export const EpisodeDataStreamProvider = RuntimeEpisodeDataStreamProvider;

/** Reads the current episode renderer's typed data stream. */
export function useEpisodeDataStream(): EpisodeDataStream | null {
  return useRuntimeEpisodeDataStream<DecodedFrame, EpisodeStreamCache>();
}

/** Returns the typed publisher for the current episode renderer. */
export function useSetEpisodeDataStream(): (
  next: EpisodeDataStream | null,
) => void {
  return useSetRuntimeEpisodeDataStream<DecodedFrame, EpisodeStreamCache>();
}

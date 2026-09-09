import type { DecodedFrame } from "../../../ir";
import { type DataStream as RuntimeEpisodeDataStream } from "../../../runtime";
import type { EpisodeStreamCache } from "../../../runtime";
import {
  DataStreamProvider as RuntimeEpisodeDataStreamProvider,
  useDataStream as useRuntimeEpisodeDataStream,
  useSetDataStream as useSetRuntimeEpisodeDataStream,
} from "../../../runtime/react";

/** Episode renderer specialization of the shared runtime data stream. */
export type DataStream = RuntimeEpisodeDataStream<
  DecodedFrame,
  EpisodeStreamCache
>;

/** Shared provider used by the episode renderer shell. */
export const DataStreamProvider = RuntimeEpisodeDataStreamProvider;

/** Reads the current episode renderer's typed data stream. */
export function useDataStream(): DataStream | null {
  return useRuntimeEpisodeDataStream<DecodedFrame, EpisodeStreamCache>();
}

/** Returns the typed publisher for the current episode renderer. */
export function useSetDataStream(): (next: DataStream | null) => void {
  return useSetRuntimeEpisodeDataStream<DecodedFrame, EpisodeStreamCache>();
}

import type { DecodedFrame } from "../ir";
import type { TimelineIndex } from "./timeline-index";

/** Minimum identity required for a source-scoped runtime data stream. */
export interface SourceScopedDataStream {
  readonly sourceKey: string;
}

/** Format-neutral data stream published to episode consumers. */
export interface DataStream<
  TFrame = DecodedFrame,
  TCache = unknown,
> extends SourceScopedDataStream {
  readonly getStreamCache: (stream: string) => TCache | undefined;
  readonly getTimelineIndex: () => TimelineIndex | null;
  readonly readStreamFrames?: (request: {
    readonly endTimeNs: bigint;
    readonly startTimeNs: bigint;
    readonly stream: string;
  }) => Promise<readonly TFrame[]>;
  readonly subscribeToStream: (stream: string) => () => void;
}

/** Erased frame/cache specialization stored by React integrations. */
export type AnyEpisodeDataStream = DataStream<unknown, unknown>;

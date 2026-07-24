import type { DecodedFrame, PointCloudRenderChannelPayload } from "../ir";
import type { TimelineIndex } from "./timeline-index";

/** Minimum identity required for a source-scoped runtime data stream. */
export interface SourceScopedDataStream {
  readonly sourceKey: string;
}

/** Presentation preferences that affect worker-side stream projection. */
export interface StreamSubscriptionOptions {
  readonly pointCloudColorBy?: string;
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
  readonly readPointCloudChannel?: (request: {
    readonly activeColorBy: string;
    readonly capacity: number;
    readonly sampledPointCount: number;
    readonly samplePlanKey: string;
    readonly sourceIndices: Uint32Array;
    readonly stream: string;
    readonly timestampNs: bigint;
  }) => Promise<PointCloudRenderChannelPayload>;
  readonly subscribeToStream: (
    stream: string,
    options?: StreamSubscriptionOptions,
  ) => () => void;
}

/** Erased frame/cache specialization stored by React integrations. */
export type AnyEpisodeDataStream = DataStream<unknown, unknown>;

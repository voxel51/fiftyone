import type { StreamId } from "./manifest";

/** Whether one observed relationship is timeless or timestamped. */
export type EpisodeTransformTopologyEdgeKind = "static" | "temporal";

/**
 * One source-qualified relationship observed during a bounded topology scan.
 *
 * Slices may report the same relationship repeatedly. Consumers aggregate by
 * parent and child, sum `occurrenceCount`, and collect contributing source
 * names and stream ids.
 */
export interface EpisodeTransformTopologyEdgeObservation {
  readonly childFrameId: string;
  readonly firstObservedTimeNs?: bigint;
  readonly kind: EpisodeTransformTopologyEdgeKind;
  readonly lastObservedTimeNs?: bigint;
  readonly occurrenceCount: number;
  readonly parentFrameId: string;
  readonly sourceName: string;
  readonly sourceStreamId: StreamId;
}

/** One renderable episode stream observed in a coordinate frame. */
export interface EpisodeTransformTopologyFrameUse {
  readonly frameId: string;
  readonly sourceName: string;
  readonly streamId: StreamId;
}

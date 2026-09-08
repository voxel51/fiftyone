import type React from "react";
import type {
  ByteSourceDescriptor,
  EpisodeRecordingFacts,
  StreamDescriptor,
  TimeWindow,
  TransformTopology,
} from "../../ir";
import type { RawRecordCapability } from "../../ports";

/** Namespaced identity for an action contributed to the episode header. */
export type EpisodeHeaderActionId = `${string}:${string}`;

/** Modal-only facts exposed to product-edition episode actions. */
export interface EpisodeHeaderActionContext {
  readonly datasetId: string;
  readonly rawRecords?: RawRecordCapability;
  readonly recordingFacts?: EpisodeRecordingFacts;
  readonly sampleId: string;
  readonly source: ByteSourceDescriptor;
  readonly streams: readonly StreamDescriptor[];
  readonly timeRange: TimeWindow;
  readonly transformTopology?: TransformTopology;
  readonly visibleStreamIds: readonly string[];
}

/** One independently registered action rendered by the episode header. */
export interface EpisodeHeaderAction {
  readonly id: EpisodeHeaderActionId;
  readonly order: number;
  readonly Component: React.ComponentType<EpisodeHeaderActionContext>;
}

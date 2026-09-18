import type { IconName } from "@voxel51/voodo";
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

/** Access to the viewer's versioned portable JSON format. */
export interface EpisodeLayoutControls {
  readonly scopeKey: string | null;
  readonly maxBytes: number;
  readonly capture: () => string;
  readonly validate: (json: string) => void;
  readonly apply: (json: string) => void;
  /**
   * Identity of the user-authored settings in valid layout JSON, for change
   * detection. Ignores key order and viewer state the runtime re-expresses on
   * its own (camera pose compositions). Throws for JSON `validate` rejects.
   */
  readonly changeKey: (json: string) => string;
}

/** Modal-only facts exposed to registered episode actions. */
export interface EpisodeHeaderActionContext {
  readonly datasetId: string;
  readonly layouts?: EpisodeLayoutControls;
  /** Present for actions opened from the existing Layout menu. */
  readonly layoutMenu?: {
    readonly open: boolean;
    readonly onClose: () => void;
  };
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
  /** Places the trigger in Layout while keeping its dialog mounted. */
  readonly layoutMenuLabel?: string;
  /** Icon shown beside `layoutMenuLabel`, matching the built-in items. */
  readonly layoutMenuIcon?: IconName;
  /** Built-in menu capability supplied by this action. */
  readonly layoutMenuRole?: "saved-layouts";
  readonly Component: React.ComponentType<EpisodeHeaderActionContext>;
}

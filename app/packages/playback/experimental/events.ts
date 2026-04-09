import type { Buffers, BufferRange } from "@fiftyone/utilities";
import type {
  TimelineType,
  TimelineName,
  TimeSnapshot,
  PlayState,
  TimelineConfig,
  TimeRange,
} from "./types";

/** Common fields included in every timeline event payload. */
export interface TimelineEventMeta {
  timeline: TimelineName;
  type: TimelineType;
}

export type TimelineEventGroup = {
  /** Emitted when a new snapshot is committed (playback tick, seek, or setTime). */
  "timeline:timeChange": TimelineEventMeta & { snapshot: TimeSnapshot };
  /** Emitted when play state transitions (e.g. paused → playing). */
  "timeline:playStateChange": TimelineEventMeta & { state: PlayState };
  /** Emitted when config is replaced via initialize() or updateConfig(). */
  "timeline:configChange": TimelineEventMeta & {
    config: Readonly<TimelineConfig>;
  };
  /** Emitted when buffer loading progress changes. */
  "timeline:bufferChange": TimelineEventMeta & {
    loaded: Buffers;
    loading: BufferRange;
  };
  /** Emitted when the active playback range changes (time selection set or cleared). */
  "timeline:rangeChange": TimelineEventMeta & { range: TimeRange };
  /** Emitted when the user begins a scrub / seek gesture. */
  "timeline:seekStart": TimelineEventMeta;
  /** Emitted when the user finishes a scrub / seek gesture. */
  "timeline:seekEnd": TimelineEventMeta;
  /** Emitted when the manager finishes first-time setup via initialize(). */
  "timeline:initialized": TimelineEventMeta;
  /** Emitted when the manager is torn down via destroy(). */
  "timeline:destroyed": TimelineEventMeta;
};

export type TimelineStoreEventGroup = {
  /** Emitted when a new timeline manager is created and registered. */
  "store:timeline:added": TimelineEventMeta;
  /** Emitted when a timeline manager is removed and destroyed. */
  "store:timeline:removed": TimelineEventMeta;
  /** Emitted when the store's active timeline changes (or is cleared to null). */
  "store:timeline:activeTimelineChanged": { name: string | null };
};

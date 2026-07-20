import type { TemporalTagTimelineProps, Track } from "@fiftyone/playback";
import type { SampleRendererProps } from "@fiftyone/plugins";
import type React from "react";
import type { TimeWindow } from "../../ir";
import type { EpisodeSession } from "../../ports";

/** Row-level behavior contributed by an episode timeline source. */
export type TimelineTrackDecorator = NonNullable<
  TemporalTagTimelineProps["decorateTrack"]
>;

/** A real group of tracks contributed to the episode timeline. */
export interface TimelineSection {
  /** Stable, globally namespaced identity. */
  readonly id: string;
  /** Explicit product-policy order; import order never decides placement. */
  readonly order: number;
  readonly label: string;
  readonly tracks: readonly Track[];
  /** Optional source-owned row behavior. */
  readonly decorateTrack?: TimelineTrackDecorator;
}

/** Generic preferences an extension may request from the timeline host. */
export interface TimelinePreferences {
  readonly drawerMaxSize?: number;
  /** Browser-local key for a host-supported track-body height preference. */
  readonly drawerSizeStorageKey?: string;
  /** Browser-local key for a host-supported track-label width preference. */
  readonly labelWidthStorageKey?: string;
  /** Enables the host's compact track search affordance. */
  readonly timelineSearchEnabled?: boolean;
}

/** Values contributed by one registered extension for the current viewer. */
export interface TimelineContribution {
  readonly sections?: readonly TimelineSection[];
  /** Runs inside the playback, track, tiling, and episode data-stream providers. */
  readonly runtime?: React.ReactNode;
  readonly preferences?: TimelinePreferences;
  readonly onDrawerOpenChange?: (open: boolean) => void;
}

/** Product-neutral source and lifecycle facts exposed to extensions. */
export interface TimelineExtensionContext {
  readonly ctx: SampleRendererProps["ctx"];
  readonly layoutScopeKey: string;
  readonly navigationPending: boolean;
  readonly selectedAnnotationStreams: readonly string[];
  readonly session?: EpisodeSession | null;
  readonly timeRange: TimeWindow | null;
}

/** Props supplied to every registered timeline extension component. */
export interface TimelineExtensionComponentProps extends TimelineExtensionContext {
  readonly children: (contribution: TimelineContribution) => React.ReactNode;
}

/** One independently registered timeline extension. */
export interface TimelineExtension {
  readonly id: string;
  readonly order: number;
  readonly Component: React.ComponentType<TimelineExtensionComponentProps>;
}

/** Fully composed values consumed by the shared episode playback shell. */
export interface TimelineComposition {
  readonly decorateTrack: TimelineTrackDecorator;
  readonly onDrawerOpenChange?: (open: boolean) => void;
  readonly preferences: TimelinePreferences;
  readonly runtime: React.ReactNode;
  readonly tracks: readonly Track[];
}

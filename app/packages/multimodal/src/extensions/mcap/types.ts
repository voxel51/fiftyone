import type { TemporalTagTimelineProps, Track } from "@fiftyone/playback";
import type { SampleRendererProps } from "@fiftyone/plugins";
import type React from "react";
import type { ByteSourceDescriptor } from "../../query/bytes";
import type {
  McapResourceClient,
  McapTimelineRange,
} from "../../adapters/mcap";

/** Row-level behavior contributed by an MCAP timeline source. */
export type McapTimelineTrackDecorator = NonNullable<
  TemporalTagTimelineProps["decorateTrack"]
>;

/** A real group of tracks contributed to the MCAP timeline. */
export interface McapTimelineSection {
  /** Stable, globally namespaced identity. */
  readonly id: string;
  /** Explicit product-policy order; import order never decides placement. */
  readonly order: number;
  readonly label: string;
  readonly tracks: readonly Track[];
  /** Optional source-owned row behavior. */
  readonly decorateTrack?: McapTimelineTrackDecorator;
}

/** Generic preferences an extension may request from the timeline host. */
export interface McapTimelinePreferences {
  readonly drawerMaxSize?: number;
  /** Browser-local key for a host-supported track-body height preference. */
  readonly drawerSizeStorageKey?: string;
  /** Browser-local key for a host-supported track-label width preference. */
  readonly labelWidthStorageKey?: string;
  /** Enables the host's compact track search affordance. */
  readonly timelineSearchEnabled?: boolean;
}

/** Values contributed by one registered extension for the current viewer. */
export interface McapTimelineContribution {
  readonly sections?: readonly McapTimelineSection[];
  /** Runs inside the playback, track, tiling, and MCAP data-stream providers. */
  readonly runtime?: React.ReactNode;
  readonly preferences?: McapTimelinePreferences;
  readonly onDrawerOpenChange?: (open: boolean) => void;
}

/** Product-neutral source and lifecycle facts exposed to extensions. */
export interface McapTimelineExtensionContext {
  readonly client: McapResourceClient;
  readonly ctx: SampleRendererProps["ctx"];
  readonly layoutScopeKey: string;
  readonly navigationPending: boolean;
  readonly selectedAnnotationTopics: readonly string[];
  readonly source: ByteSourceDescriptor | null;
  readonly timelineRange: McapTimelineRange | null;
}

/** Props supplied to every registered MCAP timeline extension component. */
export interface McapTimelineExtensionComponentProps extends McapTimelineExtensionContext {
  readonly children: (
    contribution: McapTimelineContribution,
  ) => React.ReactNode;
}

/** One independently registered MCAP timeline extension. */
export interface McapTimelineExtension {
  readonly id: string;
  readonly order: number;
  readonly Component: React.ComponentType<McapTimelineExtensionComponentProps>;
}

/** Fully composed values consumed by the shared MCAP playback shell. */
export interface McapTimelineComposition {
  readonly decorateTrack: McapTimelineTrackDecorator;
  readonly onDrawerOpenChange?: (open: boolean) => void;
  readonly preferences: McapTimelinePreferences;
  readonly runtime: React.ReactNode;
  readonly tracks: readonly Track[];
}

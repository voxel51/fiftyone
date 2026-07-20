import type { ImageVisualization, PointCloudVisualization } from "./frames";
import type { EpisodeManifest, StreamId } from "./manifest";
import type { EpisodeTimeline } from "./playback";
import type { TimeWindow } from "./time";

/** Lightweight render-ready poster handed from an episode grid to its modal. */
export type EpisodePosterFrame =
  | {
      readonly image: ImageVisualization;
      readonly kind: "image";
    }
  | {
      readonly kind: "point-cloud";
      readonly pointCloud: PointCloudVisualization;
    };

/** Adapter-produced outcome for one lightweight episode preview read. */
export type EpisodePreviewReadStatus = "empty" | "ready" | "unavailable";

/** Cloneable result handed from a format preview provider to the grid. */
export interface EpisodePreviewReadResult {
  /** Manifest learned while opening the source, normally only on first read. */
  readonly bootstrapManifest?: EpisodeManifest;
  /** Playback scheduling metadata learned while opening the source. */
  readonly bootstrapTimeline?: EpisodeTimeline;
  /** Source time range learned while opening the source. */
  readonly bootstrapTimeRange?: TimeWindow;
  readonly frame: EpisodePosterFrame | null;
  readonly frameTimeNs?: bigint;
  readonly nextStartTimeNs?: bigint;
  /** Selected stream identity in this episode, if one was resolved. */
  readonly streamId: StreamId | null;
  /** Stable source name selected across episodes, if one was resolved. */
  readonly streamSourceName: string | null;
  /** Previewable source names suitable for dataset-scoped selection. */
  readonly streamSourceNames: readonly string[];
  readonly status: EpisodePreviewReadStatus;
}

import type { MediaReferenceDescriptor } from "@fiftyone/utilities";

import type {
  ByteSourceDescriptor,
  EpisodeManifest,
  EpisodeTimeline,
  EpisodePreviewReadResult,
} from "../ir";
import type { ByteResources, EpisodeSession, ReadPriority } from "./session";

/** One stable asset exposed by an episode resolver. */
export interface AssetDescriptor {
  readonly featureName?: string;
  readonly id: string;
  readonly mediaType?: string;
  readonly metadata?: Readonly<Record<string, string>>;
  readonly role: string;
  readonly selector?: AssetSelectorDescriptor;
}

/** Closed, browser-safe selector vocabulary returned by media manifests. */
export type AssetSelectorDescriptor =
  | { readonly kind: "whole-file" }
  | {
      readonly coordinateSystem:
        "lerobot-v3-global-dataset-row" | "parquet-file-row";
      readonly end: number;
      readonly kind: "row-interval";
      readonly start: number;
    }
  | {
      readonly fromTimestamp: number;
      readonly kind: "video-timestamp-interval";
      readonly toTimestamp: number;
    };

/** Resolves one or more physical assets that make up an episode. */
export interface AssetResolver {
  /**
   * What the server recorded about this episode, where it recorded anything.
   *
   * A format's own metadata files describe the episode too, but they live in
   * the source and cost a storage round trip each to read - per episode, per
   * viewer. An adapter given these should prefer them and read the source
   * only for what they do not cover.
   */
  /**
   * What the server recorded about the whole source.
   *
   * A source's own metadata describes it too, but that is one file per
   * source and reading it costs a storage round trip per episode that opens.
   * An adapter given this should prefer it.
   */
  describeSource?(
    options?: EpisodeOpenOptions,
  ): Promise<EpisodeDescription | null>;
  describeEpisode?(
    options?: EpisodeOpenOptions,
  ): Promise<EpisodeDescription | null>;
  list(options?: EpisodeOpenOptions): Promise<readonly AssetDescriptor[]>;
  resolve(
    assetId: string,
    options?: EpisodeOpenOptions,
  ): Promise<ByteSourceDescriptor>;
}

/**
 * Episode facts the server holds without reading the source.
 *
 * Deliberately loose: it carries whatever the server recorded, and an
 * adapter validates what it uses, exactly as it would validate a row parsed
 * out of the source's own metadata.
 */
export interface EpisodeDescription {
  readonly [field: string]: unknown;
}

/** Format-neutral source facts resolved before an adapter opens. */
export interface EpisodeSourceHints {
  readonly adapterId: string;
  readonly manifestHint?: EpisodeManifest;
  readonly playbackHint?: EpisodeTimeline;
}

/** Format-neutral source supplied to an adapter. */
export interface EpisodeSource {
  readonly assets: AssetResolver;
  readonly episodeId: string;
  readonly manifestHint?: EpisodeManifest;
  readonly playbackHint?: EpisodeTimeline;
  /** Resolves one durable hint bundle without replacing this source object. */
  resolveHints?(
    options?: EpisodeOpenOptions,
  ): Promise<EpisodeSourceHints | null>;
}

export type { MediaReferenceDescriptor } from "@fiftyone/utilities";

/** Multi-asset episode source discovered through a server manifest. */
export interface ManifestEpisodeSource extends EpisodeSource {
  readonly mediaReference: MediaReferenceDescriptor;
}

/** Lightweight sample facts available before a heavy adapter chunk loads. */
export interface SampleDescriptor {
  readonly mediaReference?: MediaReferenceDescriptor | null;
  readonly mediaType?: string;
  readonly path?: string | null;
}

/** Tiny lazy-registration record kept at the composition root. */
export interface AdapterDescriptor {
  readonly id: string;
  detect(
    sample: SampleDescriptor,
    options?: EpisodeOpenOptions,
  ): boolean | Promise<boolean>;
  load(options?: EpisodeOpenOptions): Promise<FormatAdapter>;
}

/** One lightweight poster request made before a full episode session opens. */
export interface EpisodePreviewReadRequest {
  /** Forward access-unit coverage needed to decode the requested video frame. */
  readonly decodeLookaheadNs?: bigint;
  /** Stable, human-facing source name used for cross-episode selection. */
  readonly sourceName?: string | null;
  readonly startTimeNs?: bigint;
}

/** Scheduling and cancellation controls for one preview read. */
export interface EpisodePreviewReadOptions {
  readonly priority?: ReadPriority;
  readonly signal?: AbortSignal;
}

/** Source-bound lightweight preview data plane owned by a grid cell. */
export interface EpisodePreviewSession {
  dispose(): void;
  read(
    request?: EpisodePreviewReadRequest,
    options?: EpisodePreviewReadOptions,
  ): Promise<EpisodePreviewReadResult>;
}

/** Cancellation controls for opening one episode session resource. */
export interface EpisodeOpenOptions {
  readonly signal?: AbortSignal;
}

/** Format module that turns episode assets into the shared session port. */
export interface FormatAdapter {
  readonly id: string;
  open(
    source: EpisodeSource,
    io: ByteResources,
    options?: EpisodeOpenOptions,
  ): Promise<EpisodeSession>;
  /** Optional lightweight poster path; format-specific workers remain hidden. */
  openPreview?(
    source: EpisodeSource,
    io: ByteResources,
    options?: EpisodeOpenOptions,
  ): Promise<EpisodePreviewSession>;
}

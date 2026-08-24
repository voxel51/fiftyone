import type {
  ByteSourceDescriptor,
  EpisodeManifest,
  EpisodeTimeline,
  EpisodePreviewReadResult,
} from "../ir";
import type { ByteResources, EpisodeSession, ReadPriority } from "./session";

/** One stable asset exposed by an episode resolver. */
export interface AssetDescriptor {
  readonly id: string;
  readonly mediaType?: string;
  readonly metadata?: Readonly<Record<string, string>>;
  readonly role: string;
}

/** Resolves one or more physical assets that make up an episode. */
export interface AssetResolver {
  list(options?: EpisodeOpenOptions): Promise<readonly AssetDescriptor[]>;
  resolve(
    assetId: string,
    options?: EpisodeOpenOptions,
  ): Promise<ByteSourceDescriptor>;
}

/** Format-neutral source supplied to an adapter. */
export interface EpisodeSource {
  readonly assets: AssetResolver;
  readonly episodeId: string;
  readonly manifestHint?: EpisodeManifest;
  readonly playbackHint?: EpisodeTimeline;
}

/** Browser-safe logical-media identity supplied by FiftyOne transport. */
export interface MediaReferenceDescriptor {
  readonly kind: string;
  readonly key: string;
  readonly version: string;
}

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

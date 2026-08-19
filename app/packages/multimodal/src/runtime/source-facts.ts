import type {
  ByteSourceDescriptor,
  EpisodeManifest,
  EpisodeTimeline,
  TimeWindow,
} from "../ir";

/** Current source-facts storage schema. Incompatible changes invalidate V1. */
export const SOURCE_FACTS_SCHEMA_VERSION = 1 as const;

/** OSS origin-local namespace. Authenticated compositions must supply another partition. */
export const OSS_SOURCE_FACTS_CACHE_PARTITION = "fiftyone-oss-origin";

/** Adapter whose immutable facts V1 understands and persists. */
export const SOURCE_FACTS_MCAP_ADAPTER_ID = "mcap";

/** Maximum time a local durable lookup may add to source opening. */
export const SOURCE_FACTS_LOOKUP_DEADLINE_MS = 50;

/** Provenance attached to source facts retained in memory. */
export type SourceFactsTrust = "current" | "validated" | "provisional";

/** Security and dataset boundary for one durable source-facts key. */
export interface SourceFactsScope {
  readonly cachePartition: string;
  readonly datasetId: string;
  readonly mediaField: string | null;
}

/** Credential-free logical identity for one recording. */
export interface SourceFactsIdentity {
  readonly canonicalLocator: string;
  readonly sourceId: string;
}

/** Content evidence retained with immutable source facts. */
export type SourceFactsValidator =
  | {
      readonly kind: "etag";
      readonly etag: string;
      readonly sizeBytes?: string;
    }
  | {
      readonly kind: "local-file";
      readonly lastModified: number;
      readonly name: string;
      readonly sizeBytes: string;
    };

/** Immutable metadata learned while inspecting an episode source. */
export interface SourceFactsPayload {
  readonly manifest?: EpisodeManifest;
  readonly timeRange?: TimeWindow;
  readonly timeline?: EpisodeTimeline;
}

/** Validated in-memory representation of one V1 durable entry. */
export interface StoredSourceFactsV1 {
  readonly adapterId: string;
  readonly createdAt: number;
  readonly facts: SourceFactsPayload;
  readonly identity: SourceFactsIdentity;
  readonly scope: SourceFactsScope;
  readonly validator?: SourceFactsValidator;
  readonly version: typeof SOURCE_FACTS_SCHEMA_VERSION;
}

/** Outcome of comparing persisted content evidence with the active source. */
export type SourceFactsValidationResult = "validated" | "provisional" | "stale";

/** Creates the credential-free durable identity for a byte source. */
export function sourceFactsIdentity(
  source: ByteSourceDescriptor,
): SourceFactsIdentity {
  return {
    canonicalLocator: canonicalSourceFactsLocator(source.url),
    sourceId: source.sourceId,
  };
}

/** Creates the durable logical key used by IndexedDB. */
export function sourceFactsKey(
  scope: SourceFactsScope,
  identity: SourceFactsIdentity,
): string {
  return JSON.stringify([
    SOURCE_FACTS_SCHEMA_VERSION,
    scope.cachePartition,
    scope.datasetId,
    scope.mediaField,
    identity.sourceId,
    identity.canonicalLocator,
  ]);
}

/**
 * Returns a stable full-path locator without query credentials. FiftyOne's
 * media proxy carries the backing path in `filepath`; all other URLs retain
 * their scheme/host/path identity while dropping query and fragment data.
 */
export function canonicalSourceFactsLocator(sourceUrl: string): string {
  const parsed = parseUrl(sourceUrl);
  const proxiedPath = parsed?.searchParams.get("filepath");
  return normalizeCredentialFreeLocator(proxiedPath || sourceUrl);
}

/** Returns content evidence already available on the active descriptor. */
export function sourceFactsValidatorFromSource(
  source: ByteSourceDescriptor,
): SourceFactsValidator | undefined {
  const file = source.localFile;
  if (file) {
    return {
      kind: "local-file",
      lastModified: file.lastModified,
      name: file.name,
      sizeBytes: String(file.size),
    };
  }
  const etag = normalizedEtag(source.etag);
  return etag
    ? {
        kind: "etag",
        etag,
        ...(source.sizeBytes ? { sizeBytes: source.sizeBytes } : {}),
      }
    : undefined;
}

/** Classifies persisted evidence against the active descriptor. */
export function validateSourceFactsContent(
  stored: SourceFactsValidator | undefined,
  source: ByteSourceDescriptor,
): SourceFactsValidationResult {
  const current = sourceFactsValidatorFromSource(source);
  if (current?.kind === "local-file") {
    return stored?.kind === "local-file" &&
      stored.lastModified === current.lastModified &&
      stored.name === current.name &&
      stored.sizeBytes === current.sizeBytes
      ? "validated"
      : "stale";
  }
  if (stored?.kind === "local-file") return "stale";

  if (
    source.sizeBytes &&
    stored?.sizeBytes &&
    source.sizeBytes !== stored.sizeBytes
  ) {
    return "stale";
  }
  if (current?.kind === "etag" && stored?.kind === "etag") {
    return current.etag === normalizedEtag(stored.etag) ? "validated" : "stale";
  }
  return "provisional";
}

/**
 * Normalizes scheduling facts before they enter memory or storage. Timeline
 * bounds are authoritative; a manifest range is the final fallback.
 */
export function normalizeSourceFactsPayload(
  facts: SourceFactsPayload,
): SourceFactsPayload | null {
  const timeRange = facts.timeline
    ? { endNs: facts.timeline.endNs, startNs: facts.timeline.startNs }
    : (facts.timeRange ?? facts.manifest?.timeRange);
  if (!facts.manifest && !facts.timeline && !timeRange) return null;
  return {
    ...(facts.manifest ? { manifest: facts.manifest } : {}),
    ...(facts.timeline ? { timeline: facts.timeline } : {}),
    ...(timeRange ? { timeRange } : {}),
  };
}

function normalizeCredentialFreeLocator(locator: string): string {
  const value = locator.trim().replaceAll("\\", "/");
  const parsed = parseUrl(value);
  if (parsed && hasExplicitScheme(value)) {
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    parsed.pathname = normalizePath(parsed.pathname);
    return parsed.toString();
  }
  const withoutCredentials = value.split(/[?#]/, 1)[0];
  return normalizePath(withoutCredentials);
}

function normalizePath(path: string): string {
  const leadingSlash = path.startsWith("/");
  const normalized = path.replace(/\/{2,}/g, "/");
  return leadingSlash && !normalized.startsWith("/")
    ? `/${normalized}`
    : normalized;
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value, "http://fiftyone.invalid");
  } catch {
    return null;
  }
}

function hasExplicitScheme(value: string): boolean {
  return /^[a-z][a-z\d+.-]*:/i.test(value);
}

function normalizedEtag(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().replace(/^W\//i, "");
  const unquoted =
    trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2
      ? trimmed.slice(1, -1)
      : trimmed;
  return unquoted || undefined;
}

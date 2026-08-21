import type { ByteSourceDescriptor, EpisodePreviewReadResult } from "../ir";
import type {
  EpisodeOpenOptions,
  EpisodeSession,
  EpisodeSourceHints,
} from "../ports";
import { createDefaultByteClient } from "../query/bytes/default-byte-client";
import {
  getSourceSessionHints,
  publishCurrentSourceFacts,
  publishDurableSourceFacts,
  retractDurableSourceFacts,
} from "./source-bootstrap-cache";
import {
  normalizeSourceFactsPayload,
  SOURCE_FACTS_LOOKUP_DEADLINE_MS,
  SOURCE_FACTS_MCAP_ADAPTER_ID,
  SOURCE_FACTS_SCHEMA_VERSION,
  sourceFactsIdentity,
  sourceFactsKey,
  sourceFactsValidatorFromSource,
  validateSourceFactsContent,
  type SourceFactsIdentity,
  type SourceFactsPayload,
  type SourceFactsScope,
  type StoredSourceFactsV1,
} from "./source-facts";
import {
  getSourceFactsPersistence,
  type SourceFactsPersistence,
} from "./source-facts-persistence";

/** Aggregate result names recorded without source identifiers or paths. */
export type SourceFactsLookupResult =
  | "memory-current"
  | "disk-validated"
  | "disk-provisional"
  | "miss"
  | "stale"
  | "invalid"
  | "timeout"
  | "unavailable";

/** Page-lifetime aggregate source-facts diagnostics. */
export interface SourceFactsDiagnostics {
  readonly encodedBytesWritten: number;
  readonly lookupDurationMs: number;
  readonly lookups: Readonly<Record<SourceFactsLookupResult, number>>;
  readonly validationDurationMs: number;
  readonly validations: number;
  readonly writesCompleted: number;
  readonly writesFailed: number;
  readonly writesStarted: number;
}

interface RecordSourceFactsRequest {
  readonly adapterId: string;
  readonly facts: SourceFactsPayload;
  readonly resolveRemoteValidator: boolean;
  readonly scope: SourceFactsScope;
  readonly source: ByteSourceDescriptor;
}

interface PendingWrite {
  active: RecordSourceFactsRequest | null;
  latest: RecordSourceFactsRequest | null;
  promise: Promise<void>;
}

const byteClient = createDefaultByteClient();
const pendingWrites = new Map<string, PendingWrite>();
const lookupCounts = createLookupCounts();
let totalLookupDurationMs = 0;
let totalValidationDurationMs = 0;
let validations = 0;
let encodedBytesWritten = 0;
let writesCompleted = 0;
let writesFailed = 0;
let writesStarted = 0;

/**
 * Resolves one trusted hint bundle while publishing logical disk hits to the
 * UI lane. Remote ETag discovery continues only as abortable background
 * enrichment and never extends this open beyond the local lookup deadline.
 */
export async function resolveSourceFactsHints(
  source: ByteSourceDescriptor,
  scope: SourceFactsScope,
  adapterId: string,
  options: EpisodeOpenOptions = {},
): Promise<EpisodeSourceHints | null> {
  const memory = getSourceSessionHints(source, adapterId);
  if (memory) {
    recordLookup("memory-current", 0);
    return { adapterId, ...memory };
  }
  if (options.signal?.aborted) return null;

  const identity = sourceFactsIdentity(source);
  const key = sourceFactsKey(scope, identity);
  const startedAt = nowMs();
  const result = await withLookupDeadline(
    getSourceFactsPersistence().get(key),
    options.signal,
    SOURCE_FACTS_LOOKUP_DEADLINE_MS,
  );
  const durationMs = nowMs() - startedAt;
  if (result === LOOKUP_TIMEOUT) {
    recordLookup("timeout", durationMs);
    return null;
  }
  if (result === LOOKUP_ABORTED || options.signal?.aborted) return null;
  if (!result) {
    recordLookup("miss", durationMs);
    return null;
  }
  if (
    !sameIdentity(result.identity, identity) ||
    !sameScope(result.scope, scope)
  ) {
    recordLookup("invalid", durationMs);
    void getSourceFactsPersistence().delete(key, result.createdAt);
    return null;
  }
  if (result.adapterId !== adapterId) {
    recordLookup("stale", durationMs);
    void getSourceFactsPersistence().delete(key, result.createdAt);
    return null;
  }

  const validation = validateSourceFactsContent(result.validator, source);
  if (validation === "stale") {
    recordLookup("stale", durationMs);
    void getSourceFactsPersistence().delete(key, result.createdAt);
    return null;
  }
  publishDurableSourceFacts(source, {
    adapterId,
    facts: result.facts,
    revision: result,
    trust: validation,
  });
  recordLookup(
    validation === "validated" ? "disk-validated" : "disk-provisional",
    durationMs,
  );

  if (validation === "provisional" && !source.localFile && !source.etag) {
    void validateRemoteFactsInBackground({
      entry: result,
      key,
      signal: options.signal,
      source,
    });
  }
  const hints = getSourceSessionHints(source, adapterId);
  return hints ? { adapterId, ...hints } : null;
}

/** Records immutable metadata produced by a successful lightweight preview. */
export function recordPreviewSourceFacts(
  source: ByteSourceDescriptor,
  scope: SourceFactsScope,
  result: EpisodePreviewReadResult,
): void {
  const facts = normalizeSourceFactsPayload({
    ...(result.bootstrapManifest ? { manifest: result.bootstrapManifest } : {}),
    ...(result.bootstrapTimeline ? { timeline: result.bootstrapTimeline } : {}),
    ...(result.bootstrapTimeRange
      ? { timeRange: result.bootstrapTimeRange }
      : {}),
  });
  if (!facts) return;
  recordSourceFacts(
    {
      adapterId: SOURCE_FACTS_MCAP_ADAPTER_ID,
      facts,
      resolveRemoteValidator: false,
      scope,
      source,
    },
    false,
  );
}

/** Records immutable metadata after an authoritative full session opens. */
export function recordSessionSourceFacts(
  source: ByteSourceDescriptor,
  scope: SourceFactsScope,
  session: EpisodeSession,
): void {
  const facts = normalizeSourceFactsPayload({
    manifest: session.manifest,
    ...(session.playback?.timeline
      ? { timeline: session.playback.timeline }
      : {}),
    timeRange: session.manifest.timeRange,
  });
  if (!facts) return;
  recordSourceFacts({
    adapterId: SOURCE_FACTS_MCAP_ADAPTER_ID,
    facts,
    resolveRemoteValidator: true,
    scope,
    source,
  });
}

/** Clears every durable source-facts entry, for account-boundary changes. */
export function clearSourceFacts(): Promise<void> {
  return getSourceFactsPersistence().clear();
}

/** Returns aggregate page diagnostics without source identity. */
export function getSourceFactsDiagnostics(): SourceFactsDiagnostics {
  return {
    encodedBytesWritten,
    lookupDurationMs: totalLookupDurationMs,
    lookups: { ...lookupCounts },
    validationDurationMs: totalValidationDurationMs,
    validations,
    writesCompleted,
    writesFailed,
    writesStarted,
  };
}

/** Resets aggregate diagnostics and queued jobs between tests. */
export function resetSourceFactsServiceForTests(): void {
  pendingWrites.clear();
  Object.assign(lookupCounts, createLookupCounts());
  totalLookupDurationMs = 0;
  totalValidationDurationMs = 0;
  validations = 0;
  encodedBytesWritten = 0;
  writesCompleted = 0;
  writesFailed = 0;
  writesStarted = 0;
}

function recordSourceFacts(
  request: RecordSourceFactsRequest,
  publishCurrent = true,
): void {
  if (request.adapterId !== SOURCE_FACTS_MCAP_ADAPTER_ID) return;
  const facts = normalizeSourceFactsPayload(request.facts);
  if (!facts) return;
  if (publishCurrent) publishCurrentSourceFacts(request.source, facts);
  const normalizedRequest = { ...request, facts };
  const key = sourceFactsKey(
    normalizedRequest.scope,
    sourceFactsIdentity(normalizedRequest.source),
  );
  const current = pendingWrites.get(key);
  if (current) {
    if (
      (current.active && sameWriteFacts(current.active, normalizedRequest)) ||
      (current.latest && sameWriteFacts(current.latest, normalizedRequest))
    ) {
      return;
    }
    if (
      !normalizedRequest.resolveRemoteValidator &&
      (current.active?.resolveRemoteValidator ||
        current.latest?.resolveRemoteValidator)
    ) {
      return;
    }
    current.latest = normalizedRequest;
    return;
  }
  const job = {} as PendingWrite;
  job.active = null;
  job.latest = normalizedRequest;
  job.promise = runWriteQueue(key, job).finally(() => {
    if (pendingWrites.get(key) === job) pendingWrites.delete(key);
  });
  pendingWrites.set(key, job);
}

async function runWriteQueue(key: string, job: PendingWrite): Promise<void> {
  while (job.latest) {
    const request = job.latest;
    job.latest = null;
    job.active = request;
    writesStarted++;
    try {
      const result = await persistSourceFacts(
        key,
        request,
        getSourceFactsPersistence(),
      );
      if (result.stored) {
        writesCompleted++;
        encodedBytesWritten += result.byteLength ?? 0;
      } else {
        writesFailed++;
      }
    } catch {
      writesFailed++;
    }
    job.active = null;
  }
}

async function persistSourceFacts(
  key: string,
  request: RecordSourceFactsRequest,
  persistence: SourceFactsPersistence,
) {
  let source = request.source;
  let validator = sourceFactsValidatorFromSource(source);
  if (!validator && !source.localFile && request.resolveRemoteValidator) {
    source = (await byteClient.stat?.(source)) ?? source;
    validator = sourceFactsValidatorFromSource(source);
  }
  const entry: StoredSourceFactsV1 = {
    adapterId: request.adapterId,
    createdAt: Date.now(),
    facts: request.facts,
    identity: sourceFactsIdentity(request.source),
    scope: request.scope,
    ...(validator ? { validator } : {}),
    version: SOURCE_FACTS_SCHEMA_VERSION,
  };
  return persistence.put(key, entry);
}

async function validateRemoteFactsInBackground({
  entry,
  key,
  signal,
  source,
}: {
  readonly entry: StoredSourceFactsV1;
  readonly key: string;
  readonly signal?: AbortSignal;
  readonly source: ByteSourceDescriptor;
}): Promise<void> {
  const startedAt = nowMs();
  let resolved: ByteSourceDescriptor | undefined;
  try {
    resolved = await byteClient.stat?.(source, signal);
  } catch {
    return;
  }
  if (!resolved || signal?.aborted) return;
  validations++;
  totalValidationDurationMs += nowMs() - startedAt;
  const validation = validateSourceFactsContent(entry.validator, resolved);
  if (validation === "stale") {
    retractDurableSourceFacts(source, entry);
    await getSourceFactsPersistence().delete(key, entry.createdAt);
    return;
  }
  if (validation !== "validated" || signal?.aborted) return;
  publishDurableSourceFacts(source, {
    adapterId: entry.adapterId,
    facts: entry.facts,
    revision: entry,
    trust: "validated",
  });
}

const LOOKUP_TIMEOUT = Symbol("source-facts-timeout");
const LOOKUP_ABORTED = Symbol("source-facts-aborted");

function withLookupDeadline<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
  deadlineMs: number,
): Promise<T | typeof LOOKUP_TIMEOUT | typeof LOOKUP_ABORTED> {
  if (signal?.aborted) return Promise.resolve(LOOKUP_ABORTED);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (
      value: T | typeof LOOKUP_TIMEOUT | typeof LOOKUP_ABORTED,
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(value);
    };
    const onAbort = () => finish(LOOKUP_ABORTED);
    const timer = setTimeout(() => finish(LOOKUP_TIMEOUT), deadlineMs);
    signal?.addEventListener("abort", onAbort, { once: true });
    promise.then(finish, () => finish(null as T));
  });
}

function sameIdentity(
  left: SourceFactsIdentity,
  right: SourceFactsIdentity,
): boolean {
  return (
    left.sourceId === right.sourceId &&
    left.canonicalLocator === right.canonicalLocator
  );
}

function sameScope(left: SourceFactsScope, right: SourceFactsScope): boolean {
  return (
    left.cachePartition === right.cachePartition &&
    left.datasetId === right.datasetId &&
    left.mediaField === right.mediaField
  );
}

function sameWriteFacts(
  left: RecordSourceFactsRequest,
  right: RecordSourceFactsRequest,
): boolean {
  return (
    left.adapterId === right.adapterId &&
    left.resolveRemoteValidator === right.resolveRemoteValidator &&
    left.source === right.source &&
    left.facts.manifest === right.facts.manifest &&
    left.facts.timeline === right.facts.timeline &&
    left.facts.timeRange?.startNs === right.facts.timeRange?.startNs &&
    left.facts.timeRange?.endNs === right.facts.timeRange?.endNs
  );
}

function recordLookup(
  result: SourceFactsLookupResult,
  durationMs: number,
): void {
  lookupCounts[result]++;
  totalLookupDurationMs += durationMs;
}

function createLookupCounts(): Record<SourceFactsLookupResult, number> {
  return {
    "disk-provisional": 0,
    "disk-validated": 0,
    invalid: 0,
    "memory-current": 0,
    miss: 0,
    stale: 0,
    timeout: 0,
    unavailable: 0,
  };
}

function nowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

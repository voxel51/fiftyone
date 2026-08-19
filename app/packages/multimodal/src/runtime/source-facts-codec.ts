import {
  BYTE_SOURCE_READ_PROFILE,
  STREAM_KIND,
  type EpisodeManifest,
  type EpisodeRecordingFacts,
  type EpisodeTimeline,
  type StreamCalibration,
  type StreamDescriptor,
  type TimeDomain,
  type TimeWindow,
  type TransformTopology,
} from "../ir";
import {
  SOURCE_FACTS_SCHEMA_VERSION,
  type SourceFactsIdentity,
  type SourceFactsPayload,
  type SourceFactsScope,
  type SourceFactsValidator,
  type StoredSourceFactsV1,
} from "./source-facts";

const BIGINT_TAG = "__fiftyone_source_facts_bigint_v1__";
const DECIMAL_INTEGER = /^\d+$/;
const STREAM_KINDS = new Set<string>(Object.values(STREAM_KIND));
const TIME_DOMAIN_KINDS = new Set(["duration", "sequence", "timestamp"]);
const READ_PROFILES = new Set<string>(Object.values(BYTE_SOURCE_READ_PROFILE));
const MESSAGE_INDEX_STATUSES = new Set([
  "absent",
  "complete",
  "partial",
  "unknown",
]);

/** JSON-safe durable envelope and its exact UTF-8 size. */
export interface EncodedSourceFacts {
  readonly byteLength: number;
  readonly value: string;
}

/** Encodes validated facts with lossless decimal bigint markers. */
export function encodeStoredSourceFacts(
  entry: StoredSourceFactsV1,
): EncodedSourceFacts | null {
  if (!validStoredSourceFacts(entry)) return null;
  try {
    const value = JSON.stringify(entry, (_key, child: unknown) => {
      if (typeof child === "bigint") return { [BIGINT_TAG]: child.toString() };
      if (ArrayBuffer.isView(child) || child instanceof ArrayBuffer) {
        throw new Error("Source facts cannot contain binary payloads");
      }
      return child;
    });
    return { byteLength: new TextEncoder().encode(value).byteLength, value };
  } catch {
    return null;
  }
}

/** Decodes and runtime-validates one untrusted durable envelope. */
export function decodeStoredSourceFacts(
  value: unknown,
): StoredSourceFactsV1 | null {
  if (typeof value !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(value, (_key, child: unknown) => {
      if (!recordWithKeys(child, [BIGINT_TAG])) return child;
      const encoded = child[BIGINT_TAG];
      if (typeof encoded !== "string" || !/^-?\d+$/.test(encoded)) {
        throw new Error("Invalid source-facts bigint");
      }
      return BigInt(encoded);
    });
    return validStoredSourceFacts(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Runtime validator for all fields persisted by the V1 codec. */
export function validStoredSourceFacts(
  value: unknown,
): value is StoredSourceFactsV1 {
  if (
    !recordWithKeys(value, [
      "adapterId",
      "createdAt",
      "facts",
      "identity",
      "scope",
      "validator",
      "version",
    ]) ||
    value.version !== SOURCE_FACTS_SCHEMA_VERSION ||
    !nonEmptyString(value.adapterId) ||
    !nonNegativeInteger(value.createdAt) ||
    !validIdentity(value.identity) ||
    !validScope(value.scope) ||
    (value.validator !== undefined && !validValidator(value.validator)) ||
    !validFacts(value.facts)
  ) {
    return false;
  }
  return true;
}

function validIdentity(value: unknown): value is SourceFactsIdentity {
  return (
    recordWithKeys(value, ["canonicalLocator", "sourceId"]) &&
    nonEmptyString(value.canonicalLocator) &&
    nonEmptyString(value.sourceId)
  );
}

function validScope(value: unknown): value is SourceFactsScope {
  return (
    recordWithKeys(value, ["cachePartition", "datasetId", "mediaField"]) &&
    nonEmptyString(value.cachePartition) &&
    nonEmptyString(value.datasetId) &&
    (value.mediaField === null || nonEmptyString(value.mediaField))
  );
}

function validValidator(value: unknown): value is SourceFactsValidator {
  if (!isRecord(value)) return false;
  if (value.kind === "etag") {
    return (
      hasOnlyKeys(value, ["kind", "etag", "sizeBytes"]) &&
      nonEmptyString(value.etag) &&
      optionalByteSize(value.sizeBytes)
    );
  }
  if (value.kind === "local-file") {
    return (
      hasOnlyKeys(value, ["kind", "lastModified", "name", "sizeBytes"]) &&
      nonNegativeInteger(value.lastModified) &&
      nonEmptyString(value.name) &&
      byteSize(value.sizeBytes)
    );
  }
  return false;
}

function validFacts(value: unknown): value is SourceFactsPayload {
  if (
    !recordWithKeys(value, ["manifest", "timeline", "timeRange"]) ||
    (value.manifest !== undefined && !validManifest(value.manifest)) ||
    (value.timeline !== undefined && !validTimeline(value.timeline)) ||
    (value.timeRange !== undefined && !validTimeRange(value.timeRange)) ||
    (!value.manifest && !value.timeline && !value.timeRange)
  ) {
    return false;
  }
  const manifest = value.manifest as EpisodeManifest | undefined;
  const timeline = value.timeline as EpisodeTimeline | undefined;
  const timeRange = value.timeRange as TimeWindow | undefined;
  if (
    manifest &&
    timeline &&
    manifest.timeDomain.id !== timeline.timeDomainId
  ) {
    return false;
  }
  return !timeline || !timeRange || sameRange(timeline, timeRange);
}

function validManifest(value: unknown): value is EpisodeManifest {
  if (
    !recordWithKeys(value, [
      "calibrations",
      "episodeId",
      "metadata",
      "recordingFacts",
      "streams",
      "timeDomain",
      "timeRange",
      "transformTopology",
    ]) ||
    !nonEmptyString(value.episodeId) ||
    !Array.isArray(value.streams) ||
    !validTimeDomain(value.timeDomain) ||
    !validTimeRange(value.timeRange) ||
    !optionalStringRecord(value.metadata) ||
    (value.recordingFacts !== undefined &&
      !validRecordingFacts(value.recordingFacts)) ||
    (value.calibrations !== undefined &&
      (!Array.isArray(value.calibrations) ||
        !value.calibrations.every(validCalibration))) ||
    (value.transformTopology !== undefined &&
      !validTransformTopology(value.transformTopology))
  ) {
    return false;
  }
  const range = value.timeRange as TimeWindow;
  const streamIds = new Set<string>();
  for (const candidate of value.streams) {
    if (!validStream(candidate, range) || streamIds.has(candidate.id)) {
      return false;
    }
    streamIds.add(candidate.id);
  }
  const calibrationIds = new Set<string>();
  for (const candidate of value.calibrations ?? []) {
    if (calibrationIds.has(candidate.streamId)) return false;
    calibrationIds.add(candidate.streamId);
  }
  return true;
}

function validStream(
  value: unknown,
  manifestRange: TimeWindow,
): value is StreamDescriptor {
  return (
    recordWithKeys(value, [
      "approxRateHz",
      "coordinateFrameId",
      "count",
      "id",
      "kind",
      "metadata",
      "payload",
      "sourceName",
      "timeRange",
    ]) &&
    nonEmptyString(value.id) &&
    nonEmptyString(value.sourceName) &&
    typeof value.kind === "string" &&
    STREAM_KINDS.has(value.kind) &&
    optionalFiniteNonNegative(value.approxRateHz) &&
    optionalNonNegativeInteger(value.count) &&
    optionalString(value.coordinateFrameId) &&
    optionalStringRecord(value.metadata) &&
    validPayload(value.payload) &&
    validTimeRange(value.timeRange) &&
    rangeContains(manifestRange, value.timeRange)
  );
}

function validPayload(value: unknown): boolean {
  return (
    recordWithKeys(value, ["encoding", "schema", "schemaEncoding"]) &&
    nonEmptyString(value.encoding) &&
    optionalString(value.schema) &&
    optionalString(value.schemaEncoding)
  );
}

function validTimeDomain(value: unknown): value is TimeDomain {
  return (
    recordWithKeys(value, ["id", "kind", "originNs"]) &&
    nonEmptyString(value.id) &&
    typeof value.kind === "string" &&
    TIME_DOMAIN_KINDS.has(value.kind) &&
    (value.originNs === undefined || typeof value.originNs === "bigint")
  );
}

function validTimeRange(value: unknown): value is TimeWindow {
  return recordWithKeys(value, ["endNs", "startNs"]) && validRangeFields(value);
}

function validRangeFields(value: Record<string, unknown>): value is Record<
  string,
  unknown
> & {
  readonly endNs: bigint;
  readonly startNs: bigint;
} {
  return (
    typeof value.startNs === "bigint" &&
    typeof value.endNs === "bigint" &&
    value.endNs >= value.startNs
  );
}

function validTimeline(value: unknown): value is EpisodeTimeline {
  if (
    !recordWithKeys(value, [
      "byteTimeline",
      "endNs",
      "startNs",
      "timeDomainId",
    ]) ||
    !validRangeFields(value) ||
    !nonEmptyString(value.timeDomainId) ||
    (value.byteTimeline !== undefined && !Array.isArray(value.byteTimeline))
  ) {
    return false;
  }
  let previousEnd: bigint | undefined;
  let previousOffset: bigint | undefined;
  let previousBytes: number | undefined;
  for (const point of value.byteTimeline ?? []) {
    if (
      !recordWithKeys(point, [
        "cumulativeCompressedBytes",
        "endTimeNs",
        "startOffsetBytes",
      ]) ||
      !finiteNonNegative(point.cumulativeCompressedBytes) ||
      typeof point.endTimeNs !== "bigint" ||
      typeof point.startOffsetBytes !== "bigint" ||
      point.startOffsetBytes < 0n ||
      point.endTimeNs < value.startNs ||
      point.endTimeNs > value.endNs ||
      (previousEnd !== undefined && point.endTimeNs < previousEnd) ||
      (previousOffset !== undefined &&
        point.startOffsetBytes < previousOffset) ||
      (previousBytes !== undefined &&
        point.cumulativeCompressedBytes < previousBytes)
    ) {
      return false;
    }
    previousEnd = point.endTimeNs;
    previousOffset = point.startOffsetBytes;
    previousBytes = point.cumulativeCompressedBytes;
  }
  return true;
}

function validCalibration(value: unknown): value is StreamCalibration {
  if (
    !recordWithKeys(value, ["calibration", "streamId"]) ||
    !nonEmptyString(value.streamId) ||
    !isRecord(value.calibration)
  ) {
    return false;
  }
  const calibration = value.calibration;
  return (
    recordWithKeys(calibration, [
      "binningX",
      "binningY",
      "coordinateFrameId",
      "D",
      "distortionModel",
      "height",
      "K",
      "kind",
      "P",
      "R",
      "roi",
      "timestampNs",
      "width",
    ]) &&
    calibration.kind === "camera-calibration" &&
    positiveInteger(calibration.width) &&
    positiveInteger(calibration.height) &&
    finiteNumberArray(calibration.K, 9) &&
    optionalFiniteNumberArray(calibration.R, 9) &&
    optionalFiniteNumberArray(calibration.P, 12) &&
    optionalFiniteNumberArray(calibration.D) &&
    optionalNonNegativeInteger(calibration.binningX) &&
    optionalNonNegativeInteger(calibration.binningY) &&
    optionalString(calibration.coordinateFrameId) &&
    optionalString(calibration.distortionModel) &&
    (calibration.timestampNs === undefined ||
      typeof calibration.timestampNs === "bigint") &&
    (calibration.roi === undefined || validCalibrationRoi(calibration.roi))
  );
}

function validCalibrationRoi(value: unknown): boolean {
  return (
    recordWithKeys(value, [
      "doRectify",
      "height",
      "width",
      "xOffset",
      "yOffset",
    ]) &&
    typeof value.doRectify === "boolean" &&
    nonNegativeInteger(value.height) &&
    nonNegativeInteger(value.width) &&
    nonNegativeInteger(value.xOffset) &&
    nonNegativeInteger(value.yOffset)
  );
}

function validTransformTopology(value: unknown): value is TransformTopology {
  if (!recordWithKeys(value, ["edges"]) || !Array.isArray(value.edges)) {
    return false;
  }
  const identities = new Set<string>();
  for (const edge of value.edges) {
    if (
      !recordWithKeys(edge, [
        "childFrameId",
        "parentFrameId",
        "sourceStreamId",
      ]) ||
      !nonEmptyString(edge.childFrameId) ||
      !nonEmptyString(edge.parentFrameId) ||
      !optionalString(edge.sourceStreamId)
    ) {
      return false;
    }
    const identity = `${edge.parentFrameId}\0${edge.childFrameId}\0${
      edge.sourceStreamId ?? ""
    }`;
    if (identities.has(identity)) return false;
    identities.add(identity);
  }
  return true;
}

function validRecordingFacts(value: unknown): value is EpisodeRecordingFacts {
  return (
    recordWithKeys(value, [
      "applicationSupport",
      "channelCount",
      "durationNs",
      "endTimeNs",
      "format",
      "mcap",
      "messageCount",
      "readProfile",
      "schemaCount",
      "schemaCoverage",
      "sizeBytes",
      "startTimeNs",
      "topicCount",
    ]) &&
    nonEmptyString(value.format) &&
    optionalNonNegativeInteger(value.channelCount) &&
    optionalDecimal(value.durationNs) &&
    optionalDecimal(value.endTimeNs) &&
    optionalDecimal(value.messageCount) &&
    optionalDecimal(value.sizeBytes) &&
    optionalDecimal(value.startTimeNs) &&
    optionalNonNegativeInteger(value.schemaCount) &&
    optionalNonNegativeInteger(value.topicCount) &&
    (value.readProfile === undefined ||
      (typeof value.readProfile === "string" &&
        READ_PROFILES.has(value.readProfile))) &&
    (value.applicationSupport === undefined ||
      validApplicationSupport(value.applicationSupport)) &&
    (value.schemaCoverage === undefined ||
      validSchemaCoverage(value.schemaCoverage)) &&
    (value.mcap === undefined || validMcapFacts(value.mcap))
  );
}

function validApplicationSupport(value: unknown): boolean {
  return (
    recordWithKeys(value, [
      "inspectableStreamCount",
      "renderableStreamCount",
      "unavailableStreamCount",
    ]) &&
    nonNegativeInteger(value.inspectableStreamCount) &&
    nonNegativeInteger(value.renderableStreamCount) &&
    nonNegativeInteger(value.unavailableStreamCount)
  );
}

function validSchemaCoverage(value: unknown): boolean {
  return (
    recordWithKeys(value, [
      "embeddedSchemaChannelCount",
      "missingSchemaChannelCount",
    ]) &&
    nonNegativeInteger(value.embeddedSchemaChannelCount) &&
    nonNegativeInteger(value.missingSchemaChannelCount)
  );
}

function validMcapFacts(value: unknown): boolean {
  return (
    recordWithKeys(value, [
      "attachmentCount",
      "attachments",
      "chunkCount",
      "compression",
      "compressionRatio",
      "library",
      "medianChannelsPerChunk",
      "medianChunkSizeBytes",
      "medianChunkSpanNs",
      "messageIndexStatus",
      "metadataRecordCount",
      "metadataRecordNames",
      "profile",
    ]) &&
    optionalNonNegativeInteger(value.attachmentCount) &&
    optionalNonNegativeInteger(value.chunkCount) &&
    optionalFiniteNonNegative(value.compressionRatio) &&
    optionalString(value.library) &&
    optionalFiniteNonNegative(value.medianChannelsPerChunk) &&
    optionalDecimal(value.medianChunkSizeBytes) &&
    optionalDecimal(value.medianChunkSpanNs) &&
    optionalNonNegativeInteger(value.metadataRecordCount) &&
    optionalString(value.profile) &&
    (value.messageIndexStatus === undefined ||
      (typeof value.messageIndexStatus === "string" &&
        MESSAGE_INDEX_STATUSES.has(value.messageIndexStatus))) &&
    (value.metadataRecordNames === undefined ||
      stringArray(value.metadataRecordNames)) &&
    (value.attachments === undefined ||
      (Array.isArray(value.attachments) &&
        value.attachments.every(validAttachment))) &&
    (value.compression === undefined ||
      (Array.isArray(value.compression) &&
        value.compression.every(validCompression)))
  );
}

function validAttachment(value: unknown): boolean {
  return (
    recordWithKeys(value, ["dataSizeBytes", "mediaType", "name"]) &&
    byteSize(value.dataSizeBytes) &&
    typeof value.mediaType === "string" &&
    nonEmptyString(value.name)
  );
}

function validCompression(value: unknown): boolean {
  return (
    recordWithKeys(value, [
      "chunkCount",
      "codec",
      "compressedBytes",
      "uncompressedBytes",
    ]) &&
    nonNegativeInteger(value.chunkCount) &&
    typeof value.codec === "string" &&
    byteSize(value.compressedBytes) &&
    byteSize(value.uncompressedBytes)
  );
}

function sameRange(left: TimeWindow, right: TimeWindow): boolean {
  return left.startNs === right.startNs && left.endNs === right.endNs;
}

function rangeContains(parent: TimeWindow, child: unknown): boolean {
  const range = child as TimeWindow;
  return range.startNs >= parent.startNs && range.endNs <= parent.endNs;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function recordWithKeys(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  return isRecord(value) && hasOnlyKeys(value, keys);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function optionalStringRecord(value: unknown): boolean {
  return (
    value === undefined ||
    (isRecord(value) &&
      Object.values(value).every((child) => typeof child === "string"))
  );
}

function stringArray(value: unknown): boolean {
  return (
    Array.isArray(value) && value.every((child) => typeof child === "string")
  );
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function positiveInteger(value: unknown): boolean {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function optionalNonNegativeInteger(value: unknown): boolean {
  return value === undefined || nonNegativeInteger(value);
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function optionalFiniteNonNegative(value: unknown): boolean {
  return value === undefined || finiteNonNegative(value);
}

function finiteNumberArray(value: unknown, length?: number): boolean {
  return (
    Array.isArray(value) &&
    (length === undefined || value.length === length) &&
    value.every((child) => typeof child === "number" && Number.isFinite(child))
  );
}

function optionalFiniteNumberArray(value: unknown, length?: number): boolean {
  return value === undefined || finiteNumberArray(value, length);
}

function byteSize(value: unknown): value is string {
  return typeof value === "string" && DECIMAL_INTEGER.test(value);
}

function optionalByteSize(value: unknown): boolean {
  return value === undefined || byteSize(value);
}

function optionalDecimal(value: unknown): boolean {
  return value === undefined || byteSize(value);
}

import {
  McapRecordBuilder,
  McapStreamReader,
  type McapTypes,
} from "@mcap/core";
import type { ByteRange } from "../../../ir";
import type { ReadWorkBudget, ReadWorkUsage } from "../../../ports";
import { monotonicNowMs } from "../../../utils/monotonic-time";
import { ByteClientReadable } from "./byte-readable";
import {
  decompressMcapChunkRecord,
  mcapDecompressedChunkKeyForIndex,
} from "./chunk-records";
import { type McapDecompressedChunkCache } from "./decompressed-chunk-cache";
import {
  channelIdsForTopics,
  collectChunkMessageIndexReadRanges,
  readChunkIndexedMessageTimes,
} from "./message-index";
import { McapBoundedReadCancelledError } from "./bounded-read-cancellation";
import type {
  McapBoundedMessageReadRequest,
  McapBoundedMessageReadResult,
  McapIndexedReaderLike,
  McapReadContinuation,
} from "./types";

const DECODE_CANCELLATION_YIELD_INTERVAL = 64;

type McapChunkIndex = McapTypes.TypedMcapRecords["ChunkIndex"];
type McapMessage = McapTypes.TypedMcapRecords["Message"];

interface OrderedMessage {
  readonly chunkStartOffset: bigint;
  readonly message: McapMessage;
  readonly recordOrder: number;
}

interface ChunkGroup {
  readonly chunks: readonly McapChunkIndex[];
  readonly endTimeNs: bigint;
  readonly startTimeNs: bigint;
}

/** Dependencies for one source-bound bounded MCAP executor. */
export interface CreateMcapBoundedReaderOptions {
  /** Caller-owned and disposed with the containing reader. */
  readonly decompressedChunkCache: McapDecompressedChunkCache;
  readonly decompressHandlers: McapTypes.DecompressHandlers;
  readonly nowMs?: () => number;
  readonly readable: ByteClientReadable;
  readonly reader: McapIndexedReaderLike;
  readonly sourceKey: string | (() => string);
}

/**
 * Creates a source-bound MCAP executor that admits complete overlap groups
 * before any chunk body is fetched or decompressed.
 */
export function createMcapBoundedReader({
  decompressedChunkCache,
  decompressHandlers,
  nowMs = monotonicNowMs,
  readable,
  reader,
  sourceKey,
}: CreateMcapBoundedReaderOptions): (
  request: McapBoundedMessageReadRequest,
) => Promise<McapBoundedMessageReadResult> {
  const channelPreamble = serializeChannelPreamble(reader.channelsById);

  return async (request) => {
    validateRequest(request);
    const startedAtMs = nowMs();
    const activeSourceKey =
      typeof sourceKey === "function" ? sourceKey() : sourceKey;
    decompressedChunkCache.activateSource(activeSourceKey);
    const topics =
      request.topics === undefined
        ? undefined
        : normalizedTopics(request.topics);
    const topicsKey = topics?.join("\0") ?? "*";
    const channelIds = channelIdsForTopics(reader.channelsById, topics);
    const groups = orderAdmissionGroups(
      collectAdmissionGroups({
        channelIds,
        chunkIndexes: reader.chunkIndexes,
        endTimeNs: request.endTimeNs,
        startTimeNs: request.startTimeNs,
      }),
      request.preferredTimeNs,
    );
    let groupIndex = resolveContinuationIndex({
      continuation: request.continuation,
      endTimeNs: request.endTimeNs,
      groups,
      preferredTimeNs: request.preferredTimeNs,
      sourceKey: activeSourceKey,
      startTimeNs: request.startTimeNs,
      topicsKey,
    });
    const logicalRanges: ByteRange[] = [];
    const coverageByTopic = new Map<
      string,
      Array<{
        readonly endNs: bigint;
        readonly startNs: bigint;
      }>
    >();
    const orderedMessages: OrderedMessage[] = [];
    let chunksOpened = 0;
    let groupsOpened = 0;
    let decompressedBytes = 0;
    let decompressionCacheHits = 0;
    let logicalUncompressedBytes = 0;
    let messagesDecoded = 0;
    let transferredBytes = 0;
    let stopReason: McapBoundedMessageReadResult["stopReason"] =
      "source-exhausted";

    const usageSnapshot = (): ReadWorkUsage => ({
      chunksOpened,
      decompressedBytes,
      decompressionCacheHits,
      elapsedMs: Math.max(0, nowMs() - startedAtMs),
      logicalSourceBytes: uniqueRangeBytes(logicalRanges),
      logicalUncompressedBytes,
      messagesDecoded,
      transferredBytes,
    });

    try {
      while (groupIndex < groups.length) {
        throwIfAborted(request.signal);
        if (
          request.maxGroups !== undefined &&
          groupsOpened >= request.maxGroups
        ) {
          stopReason = "budget-exhausted";
          break;
        }
        if (wallTimeExpired(nowMs, startedAtMs, request.budget.maxWallTimeMs)) {
          stopReason = "budget-exhausted";
          break;
        }

        const group = groups[groupIndex];
        const indexRanges = group.chunks.flatMap((chunk) =>
          collectChunkMessageIndexReadRanges({
            channelIds,
            chunkIndex: chunk,
            reader,
          }),
        );
        const chunkFillRanges = group.chunks.map((chunk) =>
          readable.planReadRange(chunk.chunkStartOffset, chunk.chunkLength, {
            readahead: false,
          }),
        );
        const projectedRanges = [
          ...logicalRanges,
          ...indexRanges,
          ...chunkFillRanges,
        ];
        const projectedLogicalSourceBytes = uniqueRangeBytes(projectedRanges);
        const groupLogicalSourceBytes = uniqueRangeBytes([
          ...indexRanges,
          ...chunkFillRanges,
        ]);
        const groupUncompressedBytes = sumSafeBigInts(
          group.chunks.map((chunk) => chunk.uncompressedSize),
          "MCAP overlap-group uncompressed bytes",
        );

        if (
          group.chunks.length > request.absoluteMaxChunks ||
          groupLogicalSourceBytes > request.absoluteBudget.maxSourceBytes ||
          groupUncompressedBytes > request.absoluteBudget.maxUncompressedBytes
        ) {
          stopReason = "oversized-source-unit";
          break;
        }
        if (
          chunksOpened + group.chunks.length > request.maxChunks ||
          projectedLogicalSourceBytes > request.budget.maxSourceBytes ||
          logicalUncompressedBytes + groupUncompressedBytes >
            request.budget.maxUncompressedBytes
        ) {
          stopReason = "budget-exhausted";
          break;
        }

        const indexedMessageCount = await countSelectedIndexedMessages({
          channelIds,
          group,
          onRead: (range, transferred) => {
            logicalRanges.push(range);
            transferredBytes += transferred;
          },
          readable,
          reader,
          request,
        });
        if (wallTimeExpired(nowMs, startedAtMs, request.budget.maxWallTimeMs)) {
          stopReason = "budget-exhausted";
          break;
        }
        if (indexedMessageCount > request.absoluteBudget.maxMessages) {
          stopReason = "oversized-source-unit";
          break;
        }
        if (
          messagesDecoded + indexedMessageCount >
          request.budget.maxMessages
        ) {
          stopReason = "budget-exhausted";
          break;
        }

        const groupMessages: OrderedMessage[] = [];
        for (const chunk of group.chunks) {
          throwIfAborted(request.signal);
          const plannedFill = readable.planReadRange(
            chunk.chunkStartOffset,
            chunk.chunkLength,
            { readahead: false },
          );
          logicalRanges.push(plannedFill);
          chunksOpened += 1;
          logicalUncompressedBytes += safeBigIntToNumber(
            chunk.uncompressedSize,
            "MCAP chunk uncompressed bytes",
          );
          let sourceKeyForChunk =
            typeof sourceKey === "function" ? sourceKey() : sourceKey;
          let decompressed = decompressedChunkCache.get(
            mcapDecompressedChunkKeyForIndex(sourceKeyForChunk, chunk),
            "bounded-reader",
          );
          if (!decompressed) {
            const body = await readable.readContained(
              chunk.chunkStartOffset,
              chunk.chunkLength,
              { signal: request.signal },
            );
            transferredBytes += body.transferredBytes;
            sourceKeyForChunk =
              typeof sourceKey === "function" ? sourceKey() : sourceKey;
            decompressed = decompressedChunkCache.getOrLoad(
              mcapDecompressedChunkKeyForIndex(sourceKeyForChunk, chunk),
              "bounded-reader",
              () =>
                decompressMcapChunkRecord(
                  body.bytes,
                  chunk,
                  decompressHandlers,
                ),
            );
            if (chunk.compression.length > 0) {
              if (decompressed.cacheHit) {
                decompressionCacheHits += 1;
              } else {
                decompressedBytes += safeBigIntToNumber(
                  chunk.uncompressedSize,
                  "MCAP decompressed bytes",
                );
              }
            }

            // One precharged decompression is the atomic CPU unit; yield so a
            // worker cancel message can arrive before record parsing begins.
            await yieldToCancellation();
            throwIfAborted(request.signal);
          } else if (chunk.compression.length > 0) {
            decompressionCacheHits += 1;
          }

          const messages = parseChunkMessages({
            bytes: decompressed.bytes,
            channelPreamble,
          });

          let recordOrder = 0;
          for (const message of messages) {
            if (
              recordOrder > 0 &&
              recordOrder % DECODE_CANCELLATION_YIELD_INTERVAL === 0
            ) {
              await yieldToCancellation();
            }
            throwIfAborted(request.signal);
            if (
              channelIds.has(message.channelId) &&
              isWithinWindow(
                message.logTime,
                request.startTimeNs,
                request.endTimeNs,
              )
            ) {
              groupMessages.push({
                chunkStartOffset: chunk.chunkStartOffset,
                message,
                recordOrder,
              });
              messagesDecoded += 1;
            }
            recordOrder += 1;
          }
        }
        if (groupMessages.length !== indexedMessageCount) {
          throw new Error(
            `MCAP bounded read index/data mismatch: indexed ${indexedMessageCount}, decoded ${groupMessages.length}`,
          );
        }

        groupMessages.sort(compareOrderedMessages);
        orderedMessages.push(...groupMessages);
        recordCoverage({
          channelIds,
          coverageByTopic,
          group,
          reader,
          request,
        });
        groupIndex += 1;
        groupsOpened += 1;

        // Give queued foreground work and cancellation a deterministic
        // handoff point between complete ownership groups.
        await yieldToCancellation();
        throwIfAborted(request.signal);
        if (
          groupIndex < groups.length &&
          wallTimeExpired(nowMs, startedAtMs, request.budget.maxWallTimeMs)
        ) {
          stopReason = "budget-exhausted";
          break;
        }
      }

      const usage = usageSnapshot();
      assertUsageWithinGrant(usage, request);

      return {
        ...(stopReason !== "oversized-source-unit" && groupIndex < groups.length
          ? {
              continuation: continuationFor({
                endTimeNs: request.endTimeNs,
                nextChunkStartOffset:
                  groups[groupIndex].chunks[0].chunkStartOffset,
                preferredTimeNs: request.preferredTimeNs,
                sourceKey: activeSourceKey,
                startTimeNs: request.startTimeNs,
                topicsKey,
              }),
            }
          : {}),
        coverageByTopic: new Map(
          [...coverageByTopic].map(([topic, windows]) => [
            topic,
            mergeCoverage(windows),
          ]),
        ),
        messages: orderedMessages.map((entry) => entry.message),
        stopReason,
        usage,
      };
    } catch (error) {
      if (request.signal?.aborted) {
        throw new McapBoundedReadCancelledError(usageSnapshot());
      }
      throw error;
    }
  };
}

function collectAdmissionGroups({
  channelIds,
  chunkIndexes,
  endTimeNs,
  startTimeNs,
}: {
  readonly channelIds: ReadonlySet<number>;
  readonly chunkIndexes: readonly McapChunkIndex[];
  readonly endTimeNs: bigint | undefined;
  readonly startTimeNs: bigint | undefined;
}): ChunkGroup[] {
  const eligible = chunkIndexes
    .filter(
      (chunk) =>
        isChunkWithinWindow(chunk, startTimeNs, endTimeNs) &&
        chunkHasSelectedChannel(chunk, channelIds),
    )
    .sort((left, right) => {
      if (left.messageStartTime !== right.messageStartTime) {
        return left.messageStartTime < right.messageStartTime ? -1 : 1;
      }
      return left.chunkStartOffset < right.chunkStartOffset ? -1 : 1;
    });
  const groups: Array<{
    chunks: McapChunkIndex[];
    endTimeNs: bigint;
    startTimeNs: bigint;
  }> = [];
  for (const chunk of eligible) {
    const current = groups.at(-1);
    if (!current || chunk.messageStartTime > current.endTimeNs) {
      groups.push({
        chunks: [chunk],
        endTimeNs: chunk.messageEndTime,
        startTimeNs: chunk.messageStartTime,
      });
      continue;
    }
    current.chunks.push(chunk);
    if (chunk.messageEndTime > current.endTimeNs) {
      current.endTimeNs = chunk.messageEndTime;
    }
  }
  return groups;
}

/**
 * Orders independent ownership groups from the preferred time outward. The
 * order is deterministic and encoded into continuations, so a paged caller
 * resumes the same center-out walk without reopening earlier groups.
 */
function orderAdmissionGroups(
  groups: readonly ChunkGroup[],
  preferredTimeNs: bigint | undefined,
): ChunkGroup[] {
  if (preferredTimeNs === undefined) {
    return [...groups];
  }
  return [...groups].sort((left, right) => {
    const leftDistance = distanceToGroup(left, preferredTimeNs);
    const rightDistance = distanceToGroup(right, preferredTimeNs);
    if (leftDistance !== rightDistance) {
      return leftDistance < rightDistance ? -1 : 1;
    }
    if (left.startTimeNs !== right.startTimeNs) {
      return left.startTimeNs < right.startTimeNs ? -1 : 1;
    }
    const leftOffset = left.chunks[0]?.chunkStartOffset ?? 0n;
    const rightOffset = right.chunks[0]?.chunkStartOffset ?? 0n;
    return leftOffset < rightOffset ? -1 : leftOffset > rightOffset ? 1 : 0;
  });
}

function distanceToGroup(group: ChunkGroup, preferredTimeNs: bigint): bigint {
  if (preferredTimeNs < group.startTimeNs) {
    return group.startTimeNs - preferredTimeNs;
  }
  if (preferredTimeNs > group.endTimeNs) {
    return preferredTimeNs - group.endTimeNs;
  }
  return 0n;
}

async function countSelectedIndexedMessages({
  channelIds,
  group,
  onRead,
  readable,
  reader,
  request,
}: {
  readonly channelIds: ReadonlySet<number>;
  readonly group: ChunkGroup;
  readonly onRead: (range: ByteRange, transferredBytes: number) => void;
  readonly readable: ByteClientReadable;
  readonly reader: McapIndexedReaderLike;
  readonly request: McapBoundedMessageReadRequest;
}): Promise<number> {
  let count = 0;
  for (const chunk of group.chunks) {
    throwIfAborted(request.signal);
    const entries = await readChunkIndexedMessageTimes({
      channelIds,
      chunkIndex: chunk,
      endTimeNs: request.endTimeNs,
      readExact: async (offset, size) => {
        throwIfAborted(request.signal);
        const plannedRange = readable.planReadRange(offset, size, {
          blockFill: false,
          readahead: false,
        });
        onRead(plannedRange, 0);
        const result = await readable.readContained(offset, size, {
          exact: true,
          signal: request.signal,
        });
        onRead(result.fillRange, result.transferredBytes);
        return result.bytes;
      },
      readable,
      reader,
      startTimeNs: request.startTimeNs,
    });
    count += entries.length;
  }
  return count;
}

function parseChunkMessages({
  bytes,
  channelPreamble,
}: {
  readonly bytes: Uint8Array;
  readonly channelPreamble: Uint8Array;
}): readonly McapMessage[] {
  const stream = new McapStreamReader({
    noMagicPrefix: true,
    validateCrcs: true,
  });
  stream.append(channelPreamble);
  while (stream.nextRecord()) {
    // Prime channel identity before the standalone Chunk record.
  }
  stream.append(bytes);
  const messages: McapMessage[] = [];
  let record: McapTypes.TypedMcapRecord | undefined;
  while ((record = stream.nextRecord())) {
    if (record.type === "Message") {
      messages.push(record);
    }
  }
  if (stream.bytesRemaining() !== 0) {
    throw new Error(
      `MCAP bounded chunk parser retained ${stream.bytesRemaining()} bytes`,
    );
  }
  return messages;
}

function serializeChannelPreamble(
  channelsById: McapIndexedReaderLike["channelsById"],
): Uint8Array {
  const builder = new McapRecordBuilder();
  for (const channel of [...channelsById.values()].sort(
    (left, right) => left.id - right.id,
  )) {
    builder.writeChannel(channel);
  }
  return builder.buffer.slice();
}

function resolveContinuationIndex({
  continuation,
  endTimeNs,
  groups,
  preferredTimeNs,
  sourceKey,
  startTimeNs,
  topicsKey,
}: {
  readonly continuation: McapReadContinuation | undefined;
  readonly endTimeNs: bigint | undefined;
  readonly groups: readonly ChunkGroup[];
  readonly preferredTimeNs: bigint | undefined;
  readonly sourceKey: string;
  readonly startTimeNs: bigint | undefined;
  readonly topicsKey: string;
}): number {
  if (!continuation) {
    return 0;
  }
  if (
    continuation.version !== 1 ||
    continuation.sourceKey !== sourceKey ||
    continuation.topicsKey !== topicsKey ||
    continuation.startTimeNs !== startTimeNs ||
    continuation.endTimeNs !== endTimeNs ||
    continuation.preferredTimeNs !== preferredTimeNs
  ) {
    throw new Error("MCAP bounded read continuation does not match its source");
  }
  const index = groups.findIndex(
    (group) =>
      group.chunks[0]?.chunkStartOffset === continuation.nextChunkStartOffset,
  );
  if (index < 0) {
    throw new Error("MCAP bounded read continuation is no longer valid");
  }
  return index;
}

function continuationFor(
  continuation: Omit<McapReadContinuation, "version">,
): McapReadContinuation {
  return { ...continuation, version: 1 };
}

function recordCoverage({
  channelIds,
  coverageByTopic,
  group,
  reader,
  request,
}: {
  readonly channelIds: ReadonlySet<number>;
  readonly coverageByTopic: Map<
    string,
    Array<{ readonly endNs: bigint; readonly startNs: bigint }>
  >;
  readonly group: ChunkGroup;
  readonly reader: McapIndexedReaderLike;
  readonly request: McapBoundedMessageReadRequest;
}) {
  for (const chunk of group.chunks) {
    const startNs =
      request.startTimeNs !== undefined &&
      request.startTimeNs > chunk.messageStartTime
        ? request.startTimeNs
        : chunk.messageStartTime;
    const endNs =
      request.endTimeNs !== undefined &&
      request.endTimeNs < chunk.messageEndTime
        ? request.endTimeNs
        : chunk.messageEndTime;
    for (const channelId of chunk.messageIndexOffsets.keys()) {
      if (!channelIds.has(channelId)) {
        continue;
      }
      const topic = reader.channelsById.get(channelId)?.topic;
      if (!topic) {
        continue;
      }
      let windows = coverageByTopic.get(topic);
      if (!windows) {
        windows = [];
        coverageByTopic.set(topic, windows);
      }
      windows.push({ endNs, startNs });
    }
  }
}

function mergeCoverage(
  windows: readonly { readonly endNs: bigint; readonly startNs: bigint }[],
) {
  const sorted = [...windows].sort((left, right) =>
    left.startNs < right.startNs ? -1 : left.startNs > right.startNs ? 1 : 0,
  );
  const merged: Array<{ endNs: bigint; startNs: bigint }> = [];
  for (const window of sorted) {
    const current = merged.at(-1);
    if (!current || window.startNs > current.endNs) {
      merged.push({ ...window });
    } else if (window.endNs > current.endNs) {
      current.endNs = window.endNs;
    }
  }
  return merged;
}

function compareOrderedMessages(
  left: OrderedMessage,
  right: OrderedMessage,
): number {
  if (left.message.logTime !== right.message.logTime) {
    return left.message.logTime < right.message.logTime ? -1 : 1;
  }
  if (left.chunkStartOffset !== right.chunkStartOffset) {
    return left.chunkStartOffset < right.chunkStartOffset ? -1 : 1;
  }
  if (left.recordOrder !== right.recordOrder) {
    return left.recordOrder - right.recordOrder;
  }
  return left.message.channelId - right.message.channelId;
}

function uniqueRangeBytes(ranges: readonly ByteRange[]): number {
  const sorted = ranges
    .filter((range) => range.length > 0n)
    .map((range) => ({
      end: range.offset + range.length,
      start: range.offset,
    }))
    .sort((left, right) =>
      left.start < right.start ? -1 : left.start > right.start ? 1 : 0,
    );
  let total = 0n;
  let currentStart: bigint | undefined;
  let currentEnd: bigint | undefined;
  for (const range of sorted) {
    if (currentStart === undefined || currentEnd === undefined) {
      currentStart = range.start;
      currentEnd = range.end;
    } else if (range.start > currentEnd) {
      total += currentEnd - currentStart;
      currentStart = range.start;
      currentEnd = range.end;
    } else if (range.end > currentEnd) {
      currentEnd = range.end;
    }
  }
  if (currentStart !== undefined && currentEnd !== undefined) {
    total += currentEnd - currentStart;
  }
  return safeBigIntToNumber(total, "MCAP logical source bytes");
}

function normalizedTopics(topics: readonly string[]): readonly string[] {
  return [...new Set(topics)].sort();
}

function chunkHasSelectedChannel(
  chunk: McapChunkIndex,
  channelIds: ReadonlySet<number>,
): boolean {
  if (chunk.messageIndexOffsets.size === 0) {
    return false;
  }
  for (const channelId of chunk.messageIndexOffsets.keys()) {
    if (channelIds.has(channelId)) {
      return true;
    }
  }
  return false;
}

function isChunkWithinWindow(
  chunk: McapChunkIndex,
  startTimeNs: bigint | undefined,
  endTimeNs: bigint | undefined,
): boolean {
  return !(
    (startTimeNs !== undefined && chunk.messageEndTime < startTimeNs) ||
    (endTimeNs !== undefined && chunk.messageStartTime > endTimeNs)
  );
}

function isWithinWindow(
  timeNs: bigint,
  startTimeNs: bigint | undefined,
  endTimeNs: bigint | undefined,
): boolean {
  return !(
    (startTimeNs !== undefined && timeNs < startTimeNs) ||
    (endTimeNs !== undefined && timeNs > endTimeNs)
  );
}

function sumSafeBigInts(values: readonly bigint[], label: string): number {
  return safeBigIntToNumber(
    values.reduce((sum, value) => sum + value, 0n),
    label,
  );
}

function safeBigIntToNumber(value: bigint, label: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`${label} exceeds the safe integer range`);
  }
  return number;
}

function wallTimeExpired(
  nowMs: () => number,
  startedAtMs: number,
  maxWallTimeMs: number,
): boolean {
  return nowMs() - startedAtMs >= maxWallTimeMs;
}

function yieldToCancellation(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) {
    return;
  }
  const error = new Error("MCAP bounded read aborted");
  error.name = "AbortError";
  throw error;
}

function validateRequest(request: McapBoundedMessageReadRequest): void {
  validateBudget(request.budget, "MCAP bounded grant");
  validateBudget(request.absoluteBudget, "MCAP bounded absolute ceiling");
  for (const [value, label] of [
    [request.maxChunks, "MCAP bounded maxChunks"],
    [request.absoluteMaxChunks, "MCAP bounded absoluteMaxChunks"],
    ...(request.maxGroups === undefined
      ? []
      : ([[request.maxGroups, "MCAP bounded maxGroups"]] as const)),
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${label} must be a non-negative safe integer`);
    }
  }
}

function validateBudget(budget: ReadWorkBudget, label: string): void {
  for (const [value, name] of [
    [budget.maxMessages, "maxMessages"],
    [budget.maxSourceBytes, "maxSourceBytes"],
    [budget.maxUncompressedBytes, "maxUncompressedBytes"],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${label} ${name} must be a non-negative safe integer`);
    }
  }
  if (!Number.isFinite(budget.maxWallTimeMs) || budget.maxWallTimeMs < 0) {
    throw new Error(
      `${label} maxWallTimeMs must be a non-negative finite number`,
    );
  }
}

function assertUsageWithinGrant(
  usage: ReadWorkUsage,
  request: McapBoundedMessageReadRequest,
): void {
  if (
    usage.chunksOpened > request.maxChunks ||
    usage.logicalSourceBytes > request.budget.maxSourceBytes ||
    usage.logicalUncompressedBytes > request.budget.maxUncompressedBytes ||
    usage.messagesDecoded > request.budget.maxMessages
  ) {
    throw new Error("MCAP bounded executor exceeded an admitted hard budget");
  }
}


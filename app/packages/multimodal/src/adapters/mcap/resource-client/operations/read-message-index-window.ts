import { compareBigInt } from "../../../../ir";
import { EpisodeReadUnsupportedError } from "../../../../ports";
import { throwIfAborted } from "../../../../utils/cancellation";
import type {
  McapMessageIndexWindowResult,
  McapReadMessageIndexWindowRequest,
} from "../../contracts";
import type {
  McapChunkIndex,
  McapIndexedMessageTime,
  McapIndexedReaderLike,
} from "../../reader";
import { compareIndexedMessageTimes } from "../../reader/message-index";
import { assertRawRecordSourceWorkBound } from "./read-limits";
import {
  mcapIndexedEntryFromCursor,
  mcapMessageCursorForEntry,
} from "./message-cursor";

/** Maximum rows admitted on either side of a Browse anchor. */
const RAW_RECORD_INDEX_WINDOW_MAX_SIDE = 200;

/** Maximum message-index chunks inspected for one side of a window. */
const RAW_RECORD_INDEX_WINDOW_MAX_CHUNK_PROBES = 64;

/** Reads a bounded, exact-order message-index window without decoding payloads. */
export async function readMcapMessageIndexWindow({
  reader,
  request,
  signal,
}: {
  readonly reader: McapIndexedReaderLike;
  readonly request: McapReadMessageIndexWindowRequest;
  readonly signal?: AbortSignal;
}): Promise<McapMessageIndexWindowResult> {
  validateSide("before", request.before);
  validateSide("after", request.after);
  if (
    (request.anchorCursor === undefined) ===
    (request.anchorTimeNs === undefined)
  ) {
    throw new Error("An exact message window requires one anchor");
  }
  throwIfAborted(signal);
  if (
    !reader.readIndexedMessageTimes ||
    !reader.readLatestIndexedMessageTimes ||
    !reader.readIndexedMessages
  ) {
    throw new EpisodeReadUnsupportedError(
      "raw-record-exact-browsing",
      "Exact message browsing requires usable MCAP message indexes",
    );
  }

  let anchor: McapIndexedMessageTime;
  if (request.anchorCursor !== undefined) {
    anchor = mcapIndexedEntryFromCursor(
      request.anchorCursor,
      request.source,
      request.topic,
      request.channelId,
    );
    await assertIndexedEntryExists(reader, anchor, signal);
  } else {
    anchor = await indexedAnchorAtOrBefore(reader, request, signal);
  }
  const channelIds = new Set(
    request.channelId !== undefined
      ? [request.channelId]
      : [...reader.channelsById.values()]
          .filter((channel) => channel.topic === request.topic)
          .map((channel) => channel.id),
  );

  const previous = await readSide({
    anchor,
    channelIds,
    direction: "previous",
    limit: request.before + 2,
    reader,
    signal,
  });
  const next = await readSide({
    anchor,
    channelIds,
    direction: "next",
    limit: request.after + 1,
    reader,
    signal,
  });
  const beforeAnchor = previous.filter(
    (entry) => compareIndexedMessageTimes(entry, anchor) < 0,
  );
  const selectedPrevious =
    request.before === 0 ? [] : beforeAnchor.slice(-request.before);
  const selectedNext = next.slice(0, request.after);
  const entries = [...selectedPrevious, anchor, ...selectedNext].map(
    (entry) => ({
      cursor: mcapMessageCursorForEntry(request.source, entry),
      logTimeNs: entry.logTimeNs,
    }),
  );

  return {
    entries,
    hasNext: next.length > request.after,
    hasPrevious: beforeAnchor.length > request.before,
    selectedCursor: mcapMessageCursorForEntry(request.source, anchor),
  };
}

async function indexedAnchorAtOrBefore(
  reader: McapIndexedReaderLike,
  request: McapReadMessageIndexWindowRequest,
  signal?: AbortSignal,
): Promise<McapIndexedMessageTime> {
  if (request.anchorTimeNs === undefined) {
    throw new Error("An exact message window requires one anchor");
  }
  const entries = await reader.readLatestIndexedMessageTimes?.({
    ...(request.channelId !== undefined
      ? { channelIds: [request.channelId] }
      : {}),
    limitPerTopic: 1,
    ...(signal ? { signal } : {}),
    timeNs: request.anchorTimeNs,
    topics: [request.topic],
  });
  throwIfAborted(signal);
  const anchor = entries?.get(request.topic)?.at(-1);
  if (!anchor) {
    throw new Error(`No indexed message at or before the requested time`);
  }
  return anchor;
}

async function assertIndexedEntryExists(
  reader: McapIndexedReaderLike,
  expected: McapIndexedMessageTime,
  signal?: AbortSignal,
): Promise<void> {
  if (!reader.readIndexedMessageTimes) {
    throw new Error("MCAP message indexes are unavailable");
  }
  const chunk = reader.chunkIndexes.find(
    (candidate: McapChunkIndex) =>
      candidate.chunkStartOffset === expected.chunkStartOffset,
  );
  if (!chunk) throw new Error("MCAP message cursor is stale or invalid");
  assertRawRecordSourceWorkBound(1, chunk.messageIndexLength, 0n);
  for await (const entry of reader.readIndexedMessageTimes({
    channelIds: [expected.channelId],
    chunkStartOffsets: [expected.chunkStartOffset],
    endTimeNs: expected.logTimeNs,
    ...(signal ? { signal } : {}),
    startTimeNs: expected.logTimeNs,
    topics: [expected.topic],
  })) {
    throwIfAborted(signal);
    if (compareIndexedMessageTimes(entry, expected) === 0) return;
  }
  throw new Error("MCAP message cursor is stale or invalid");
}

async function readSide({
  anchor,
  channelIds,
  direction,
  limit,
  reader,
  signal,
}: {
  readonly anchor: McapIndexedMessageTime;
  readonly channelIds: ReadonlySet<number>;
  readonly direction: "next" | "previous";
  readonly limit: number;
  readonly reader: McapIndexedReaderLike;
  readonly signal?: AbortSignal;
}): Promise<McapIndexedMessageTime[]> {
  if (limit <= 0) return [];
  if (!reader.readIndexedMessageTimes) {
    throw new Error("MCAP message indexes are unavailable");
  }
  const chunks = reader.chunkIndexes
    .filter((chunk: McapChunkIndex) => chunkHasTopicIndex(chunk, channelIds))
    .filter((chunk: McapChunkIndex) =>
      direction === "previous"
        ? chunk.messageStartTime <= anchor.logTimeNs
        : chunk.messageEndTime >= anchor.logTimeNs,
    )
    .sort((left: McapChunkIndex, right: McapChunkIndex) =>
      direction === "previous"
        ? compareBigInt(right.messageEndTime, left.messageEndTime)
        : compareBigInt(left.messageStartTime, right.messageStartTime),
    );
  const selected: McapIndexedMessageTime[] = [];
  const probed: McapChunkIndex[] = [];

  for (const chunk of chunks) {
    if (canStop(chunk, selected, limit, direction)) break;
    if (probed.length >= RAW_RECORD_INDEX_WINDOW_MAX_CHUNK_PROBES) {
      throw new EpisodeReadUnsupportedError(
        "raw-record-index-window",
        `Exact message window exceeded ${RAW_RECORD_INDEX_WINDOW_MAX_CHUNK_PROBES} indexed chunk probes`,
      );
    }
    probed.push(chunk);
    assertRawRecordSourceWorkBound(
      probed.length,
      probed.reduce((sum, entry) => sum + entry.messageIndexLength, 0n),
      0n,
    );
    for await (const entry of reader.readIndexedMessageTimes({
      channelIds: [...channelIds],
      chunkStartOffsets: [chunk.chunkStartOffset],
      ...(direction === "previous"
        ? { endTimeNs: anchor.logTimeNs }
        : { startTimeNs: anchor.logTimeNs }),
      ...(signal ? { signal } : {}),
      topics: [anchor.topic],
    })) {
      throwIfAborted(signal);
      const comparison = compareIndexedMessageTimes(entry, anchor);
      if (
        (direction === "previous" && comparison <= 0) ||
        (direction === "next" && comparison > 0)
      ) {
        selected.push(entry);
      }
    }
    selected.sort(compareIndexedMessageTimes);
    if (selected.length > limit) {
      if (direction === "previous") {
        selected.splice(0, selected.length - limit);
      } else {
        selected.splice(limit);
      }
    }
  }
  return selected;
}

function canStop(
  chunk: McapChunkIndex,
  selected: readonly McapIndexedMessageTime[],
  limit: number,
  direction: "next" | "previous",
): boolean {
  if (selected.length < limit) return false;
  return direction === "previous"
    ? chunk.messageEndTime < selected[0].logTimeNs
    : chunk.messageStartTime > selected[selected.length - 1].logTimeNs;
}

function chunkHasTopicIndex(
  chunk: McapChunkIndex,
  channelIds: ReadonlySet<number>,
): boolean {
  if (chunk.messageIndexLength <= 0n) return false;
  for (const channelId of channelIds) {
    if (chunk.messageIndexOffsets.has(channelId)) return true;
  }
  return false;
}

function validateSide(name: string, value: number): void {
  if (
    !Number.isInteger(value) ||
    value < 0 ||
    value > RAW_RECORD_INDEX_WINDOW_MAX_SIDE
  ) {
    throw new Error(
      `Exact message window ${name} must be an integer from 0 to ${RAW_RECORD_INDEX_WINDOW_MAX_SIDE}`,
    );
  }
}

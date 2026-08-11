import type { McapIndexedMessageTime } from "../../reader";
import type { McapMessageCursor } from "../../contracts";
import { fnv1aFingerprint } from "../../../../utils/fnv1a";
import {
  byteSourceAccessKey,
  type ByteSourceDescriptor,
} from "../../../../query/bytes";

const CURSOR_PREFIX = "mcap-message:v1:";

interface McapMessageCursorPayload {
  readonly channelId: number;
  readonly chunkStartOffset: string;
  readonly logTimeNs: string;
  readonly messageOffset: string;
  readonly sourceKey: string;
  readonly topic: string;
}

/** Encodes physical message-index identity without exposing its wire shape. */
export function mcapMessageCursorForEntry(
  source: ByteSourceDescriptor,
  entry: McapIndexedMessageTime,
): McapMessageCursor {
  return `${CURSOR_PREFIX}${encodeURIComponent(
    JSON.stringify({
      channelId: entry.channelId,
      chunkStartOffset: entry.chunkStartOffset.toString(),
      logTimeNs: entry.logTimeNs.toString(),
      messageOffset: entry.messageOffset.toString(),
      sourceKey: cursorSourceEpoch(source),
      topic: entry.topic,
    } satisfies McapMessageCursorPayload),
  )}`;
}

/** Validates and resolves a cursor for the current source and topic. */
export function mcapIndexedEntryFromCursor(
  cursor: McapMessageCursor,
  source: ByteSourceDescriptor,
  topic: string,
  channelId?: number,
): McapIndexedMessageTime {
  if (!cursor.startsWith(CURSOR_PREFIX)) {
    throw new Error("Invalid MCAP message cursor");
  }

  let value: unknown;
  try {
    value = JSON.parse(decodeURIComponent(cursor.slice(CURSOR_PREFIX.length)));
  } catch {
    throw new Error("Invalid MCAP message cursor");
  }
  if (!isCursorPayload(value)) {
    throw new Error("Invalid MCAP message cursor");
  }
  if (value.sourceKey !== cursorSourceEpoch(source)) {
    throw new Error("MCAP message cursor belongs to a different source epoch");
  }
  if (value.topic !== topic) {
    throw new Error("MCAP message cursor belongs to a different topic");
  }
  if (channelId !== undefined && value.channelId !== channelId) {
    throw new Error("MCAP message cursor belongs to a different channel");
  }

  return {
    channelId: value.channelId,
    chunkStartOffset: BigInt(value.chunkStartOffset),
    logTimeNs: BigInt(value.logTimeNs),
    messageOffset: BigInt(value.messageOffset),
    topic: value.topic,
  };
}

function cursorSourceEpoch(source: ByteSourceDescriptor): string {
  // Access keys can contain signed URLs. Keep the cursor self-validating
  // without exposing source credentials through UI state or DOM attributes.
  return fnv1aFingerprint("source-epoch", byteSourceAccessKey(source));
}

function isCursorPayload(value: unknown): value is McapMessageCursorPayload {
  if (value === null || typeof value !== "object") return false;
  const payload = value as Partial<McapMessageCursorPayload>;
  return (
    Number.isInteger(payload.channelId) &&
    (payload.channelId ?? -1) >= 0 &&
    isUnsignedInteger(payload.chunkStartOffset) &&
    isUnsignedInteger(payload.logTimeNs) &&
    isUnsignedInteger(payload.messageOffset) &&
    typeof payload.sourceKey === "string" &&
    typeof payload.topic === "string"
  );
}

function isUnsignedInteger(value: unknown): value is string {
  return typeof value === "string" && /^(0|[1-9]\d*)$/.test(value);
}

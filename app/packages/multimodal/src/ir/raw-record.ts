import type { DecodedSourceTimestamps } from "./frames";
import type { StreamId } from "./manifest";

/** Budgets bounding one cloneable raw-record tree. */
export interface RawRecordPruneBudgets {
  readonly maxArrayLength?: number;
  readonly maxDepth?: number;
  readonly maxStringLength?: number;
  readonly maxTotalNodes?: number;
}

/** Bounded, structured-clone-safe representation of one decoded value. */
export type RawValueNode =
  | RawScalarNode
  | RawBytesNode
  | RawObjectNode
  | RawArrayNode
  | RawTruncatedNode;

export interface RawScalarNode {
  readonly kind: "scalar";
  readonly truncated?: boolean;
  readonly value: string;
  readonly valueType:
    | "bigint"
    | "boolean"
    | "null"
    | "number"
    | "string"
    | "undefined";
}

export interface RawBytesNode {
  readonly byteLength: number;
  readonly kind: "bytes";
  readonly preview: string;
}

export interface RawObjectNode {
  readonly droppedEntries?: number;
  readonly entries: readonly (readonly [string, RawValueNode])[];
  readonly kind: "object";
}

export interface RawArrayNode {
  readonly items: readonly RawValueNode[];
  readonly kind: "array";
  readonly totalLength: number;
}

export interface RawTruncatedNode {
  readonly kind: "truncated";
  readonly reason: "depth" | "nodes";
}

/** One stream offered by an episode's optional raw-record capability. */
export interface RawRecordStream {
  readonly encoding: string;
  readonly sampleCount: number | null;
  readonly schemaName: string | null;
  readonly sourceName: string;
  readonly streamId: StreamId;
  /** True when this source epoch can address records by exact index position. */
  readonly supportsExactBrowsing?: boolean;
}

/** Opaque, source-epoch-scoped identity for one exact indexed record. */
export type RawRecordCursor = string;

/** Index-only row used by bounded exact-record browsing. */
export interface RawRecordIndexEntry {
  readonly cursor: RawRecordCursor;
  readonly timestampNs: bigint;
}

/** Bounded index window around one exact record. */
export interface RawRecordIndexWindow {
  readonly entries: readonly RawRecordIndexEntry[];
  readonly hasNext: boolean;
  readonly hasPrevious: boolean;
  readonly selectedCursor: RawRecordCursor;
}

/** One exact cursor or timestamp anchor for a bounded index-window read. */
export type RawRecordIndexWindowRequest = {
  readonly after: number;
  readonly before: number;
} & (
  | {
      readonly anchorCursor: RawRecordCursor;
      readonly anchorTimestampNs?: never;
    }
  | {
      readonly anchorCursor?: never;
      readonly anchorTimestampNs: bigint;
    }
);

export type RawRecordStatus = "decode-error" | "empty" | "ok" | "unsupported";

/** Bounded declared schema text from the recording, never inferred from a sample. */
export interface RawRecordSchema {
  readonly name: string;
  readonly encoding: string;
  readonly text: string;
  readonly truncated?: boolean;
}

/** One raw stream record, or a legible degraded outcome, at a playback time. */
export interface RawRecordResult {
  readonly schema?: RawRecordSchema;
  /** Present only when the selected record has exact indexed identity. */
  readonly cursor?: RawRecordCursor;
  readonly decodeError?: string;
  readonly decodeUnavailableReason?:
    | "schema-unavailable"
    | "unsupported-encoding";
  readonly encoding: string;
  readonly fullJson?: string;
  readonly payloadBytes?: number;
  readonly root?: RawObjectNode;
  readonly schemaName: string | null;
  readonly sequence?: number;
  readonly sourceName: string;
  readonly sourceTimestamps?: DecodedSourceTimestamps;
  readonly status: RawRecordStatus;
  readonly streamId: StreamId;
  readonly timestampNs?: bigint;
  readonly truncated?: boolean;
  readonly validFromNs: bigint;
  readonly validUntilNs: bigint;
}

const BYTES_PREVIEW_LENGTH = 16;

/** Reconstructs JSON-ish data from one bounded raw-record node tree. */
export function rawNodeToJson(node: RawValueNode): unknown {
  switch (node.kind) {
    case "scalar":
      return scalarToJson(node);
    case "bytes":
      return `bytes(${node.byteLength}) ${node.preview}${
        node.byteLength > BYTES_PREVIEW_LENGTH ? " …" : ""
      }`;
    case "array": {
      const items = node.items.map(rawNodeToJson);
      if (node.totalLength > node.items.length) {
        items.push(`… ${node.totalLength - node.items.length} more items`);
      }
      return items;
    }
    case "object": {
      const result: Record<string, unknown> = {};
      for (const [key, child] of node.entries)
        result[key] = rawNodeToJson(child);
      if (node.droppedEntries) {
        result["…"] = `${node.droppedEntries} more fields`;
      }
      return result;
    }
    case "truncated":
      return node.reason === "depth" ? "… deeper levels omitted" : "… omitted";
  }
}

function scalarToJson(node: RawScalarNode): unknown {
  switch (node.valueType) {
    case "number": {
      const parsed = Number(node.value);
      return Number.isFinite(parsed) ? parsed : node.value;
    }
    case "boolean":
      return node.value === "true";
    case "null":
    case "undefined":
      return null;
    case "bigint": {
      const parsed = Number(node.value);
      return Number.isSafeInteger(parsed) ? parsed : node.value;
    }
    case "string":
      return node.truncated ? `${node.value}…` : node.value;
  }
}

/** Schema metadata needed to decode encoded messages at their consumer. */
export interface EncodedMessageChannel {
  readonly channelId: number;
  readonly messageEncoding: string;
  readonly schemaName?: string;
  readonly schemaEncoding?: string;
  readonly schemaData?: Uint8Array;
}

/** An owned payload buffer, safe to transfer without detaching source caches. */
export interface EncodedMessage {
  readonly channelId: number;
  readonly topic: string;
  readonly timestampNs: bigint;
  readonly logTimeNs: bigint;
  readonly publishTimeNs: bigint;
  readonly sequence: number;
  readonly data: Uint8Array;
}

/** Encoded input addressed through the format-neutral stream inventory. */
export interface EncodedStreamMessage extends EncodedMessage {
  readonly streamId: StreamId;
}

/** One grant's encoded messages and channel schemas, without decoded values. */
export interface EncodedMessageBatch<T = EncodedStreamMessage> {
  readonly records: readonly T[];
  readonly channels: readonly EncodedMessageChannel[];
}

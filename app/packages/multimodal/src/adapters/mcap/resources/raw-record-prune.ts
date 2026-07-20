import type {
  McapRawObjectNode,
  McapRawPruneBudgets,
  McapRawScalarNode,
  McapRawValueNode,
} from "../types";

/**
 * Default prune budgets for raw record reads. Sized for an inspector
 * panel: enough to read any sane telemetry message whole, small enough
 * that a multi-megabyte array field (the 18 MB occupancy grid) costs a
 * few kilobytes on the wire.
 */
export const DEFAULT_RAW_PRUNE_BUDGETS: Required<McapRawPruneBudgets> = {
  maxArrayLength: 50,
  maxDepth: 10,
  maxStringLength: 500,
  maxTotalNodes: 2_000,
};

const BYTES_PREVIEW_LENGTH = 16;

interface PruneWalkState {
  readonly budgets: Required<McapRawPruneBudgets>;
  nodesUsed: number;
  truncated: boolean;
}

/**
 * Prunes one decoded message record into a bounded, structured-clone-
 * safe node tree. Never throws on value shape: exotic values degrade to
 * stringified scalars.
 */
export function pruneRawRecord(
  record: Record<string, unknown>,
  budgets?: McapRawPruneBudgets,
): { readonly root: McapRawObjectNode; readonly truncated: boolean } {
  const state: PruneWalkState = {
    budgets: { ...DEFAULT_RAW_PRUNE_BUDGETS, ...budgets },
    nodesUsed: 0,
    truncated: false,
  };

  // The root object bypasses the depth gate (depth budgets bound
  // descent, and the root is where descent starts).
  state.nodesUsed += 1;
  const root = pruneObjectEntries(record, 0, state);
  return { root, truncated: state.truncated };
}

function pruneValue(
  value: unknown,
  depth: number,
  state: PruneWalkState,
): McapRawValueNode {
  if (state.nodesUsed >= state.budgets.maxTotalNodes) {
    state.truncated = true;
    return { kind: "truncated", reason: "nodes" };
  }
  state.nodesUsed += 1;

  if (value === null) {
    return { kind: "scalar", value: "null", valueType: "null" };
  }

  switch (typeof value) {
    case "undefined":
      return { kind: "scalar", value: "undefined", valueType: "undefined" };
    case "boolean":
      return { kind: "scalar", value: String(value), valueType: "boolean" };
    case "number":
      return { kind: "scalar", value: String(value), valueType: "number" };
    case "bigint":
      return { kind: "scalar", value: value.toString(), valueType: "bigint" };
    case "string":
      return pruneString(value, state);
    case "object":
      break;
    default:
      // function/symbol cannot appear in decoded records; degrade legibly.
      return { kind: "scalar", value: String(value), valueType: "string" };
  }

  const objectValue = value as object;

  if (objectValue instanceof Uint8Array) {
    return {
      kind: "bytes",
      byteLength: objectValue.byteLength,
      preview: bytesPreview(objectValue),
    };
  }

  if (isInt64Like(objectValue)) {
    return { kind: "scalar", value: String(objectValue), valueType: "bigint" };
  }

  if (depth >= state.budgets.maxDepth) {
    state.truncated = true;
    return { kind: "truncated", reason: "depth" };
  }

  if (Array.isArray(objectValue)) {
    return pruneArrayItems(
      objectValue.length,
      (index) => objectValue[index],
      depth,
      state,
    );
  }

  if (isNumericTypedArray(objectValue)) {
    return pruneArrayItems(
      objectValue.length,
      (index) => objectValue[index],
      depth,
      state,
    );
  }

  return pruneObjectEntries(
    objectValue as Record<string, unknown>,
    depth,
    state,
  );
}

function pruneString(value: string, state: PruneWalkState): McapRawScalarNode {
  if (value.length <= state.budgets.maxStringLength) {
    return { kind: "scalar", value, valueType: "string" };
  }

  state.truncated = true;
  return {
    kind: "scalar",
    truncated: true,
    value: value.slice(0, state.budgets.maxStringLength),
    valueType: "string",
  };
}

function pruneArrayItems(
  totalLength: number,
  elementAt: (index: number) => unknown,
  depth: number,
  state: PruneWalkState,
): McapRawValueNode {
  const keep = Math.min(totalLength, state.budgets.maxArrayLength);
  const items: McapRawValueNode[] = [];
  for (let index = 0; index < keep; index += 1) {
    if (state.nodesUsed >= state.budgets.maxTotalNodes) {
      state.truncated = true;
      break;
    }
    items.push(pruneValue(elementAt(index), depth + 1, state));
  }

  if (items.length < totalLength) {
    state.truncated = true;
  }
  return { kind: "array", items, totalLength };
}

function pruneObjectEntries(
  record: Record<string, unknown>,
  depth: number,
  state: PruneWalkState,
): McapRawObjectNode {
  const keys = Object.keys(record);
  const entries: (readonly [string, McapRawValueNode])[] = [];
  let dropped = 0;
  for (const key of keys) {
    if (state.nodesUsed >= state.budgets.maxTotalNodes) {
      dropped = keys.length - entries.length;
      state.truncated = true;
      break;
    }
    entries.push([key, pruneValue(record[key], depth + 1, state)] as const);
  }

  return dropped > 0
    ? { droppedEntries: dropped, entries, kind: "object" }
    : { entries, kind: "object" };
}

function bytesPreview(bytes: Uint8Array): string {
  const length = Math.min(bytes.byteLength, BYTES_PREVIEW_LENGTH);
  const parts: string[] = [];
  for (let index = 0; index < length; index += 1) {
    parts.push(bytes[index].toString(16).padStart(2, "0"));
  }
  return parts.join(" ");
}

/**
 * protobufjs Long duck-type: 64-bit integers decode as objects with
 * `low`/`high` words and numeric conversion methods.
 */
function isInt64Like(
  value: object,
): value is { toNumber(): number; toString(): string } {
  return (
    "toNumber" in value &&
    typeof (value as { toNumber: unknown }).toNumber === "function" &&
    "low" in value &&
    "high" in value
  );
}

type NumericTypedArray =
  | Int8Array
  | Int16Array
  | Int32Array
  | Uint16Array
  | Uint32Array
  | Uint8ClampedArray
  | Float32Array
  | Float64Array;

function isNumericTypedArray(value: object): value is NumericTypedArray {
  return (
    ArrayBuffer.isView(value) &&
    !(value instanceof DataView) &&
    !(value instanceof Uint8Array) &&
    typeof (value as { length?: unknown }).length === "number"
  );
}

/**
 * Serializes a complete decoded record for an explicit user export. This
 * stays separate from the bounded inspector tree so large arrays and strings
 * cross the worker boundary only when the user asks to copy the message.
 */
export function rawRecordToJsonText(record: Record<string, unknown>): string {
  return JSON.stringify(record, fullJsonReplacer, 2);
}

function fullJsonReplacer(_key: string, value: unknown): unknown {
  if (value === undefined) {
    return null;
  }
  if (typeof value === "bigint") {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : value.toString();
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "function" || typeof value === "symbol") {
    return String(value);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  if (isInt64Like(value)) {
    const text = String(value);
    const parsed = Number(text);
    return Number.isSafeInteger(parsed) ? parsed : text;
  }
  if (ArrayBuffer.isView(value)) {
    if (value instanceof DataView) {
      return Array.from(
        new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
      );
    }
    return Array.from(value as NumericTypedArray | Uint8Array);
  }
  return value;
}

/** @deprecated Raw-record value reconstruction now belongs to the IR. */
export { rawNodeToJson } from "../../../ir";

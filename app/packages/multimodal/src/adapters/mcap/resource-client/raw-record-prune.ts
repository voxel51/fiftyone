import type {
  McapRawObjectNode,
  McapRawPruneBudgets,
  McapRawScalarNode,
  McapRawValueNode,
} from "../contracts/index";
import { EpisodeReadUnsupportedError } from "../../../ports";

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

/** Maximum UTF-16 code units returned by one whole-message JSON export. */
export const RAW_RECORD_FULL_JSON_MAX_CODE_UNITS = 8 * 1024 * 1024;

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
 * stays separate from the bounded inspector tree, uses compact JSON, encodes
 * byte buffers as base64 envelopes, and rejects a deterministic preflight
 * bound before materializing an unsafe clipboard-sized string.
 */
export function rawRecordToJsonText(
  record: Record<string, unknown>,
  maxCodeUnits = RAW_RECORD_FULL_JSON_MAX_CODE_UNITS,
): string {
  assertFullJsonOutputBound(record, maxCodeUnits);
  const text = JSON.stringify(record, fullJsonReplacer);
  if (text.length > maxCodeUnits) throwFullJsonOutputBound(maxCodeUnits);
  return text;
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
  const boxed = boxedPrimitiveValue(value);
  if (boxed !== null) return fullJsonReplacer("", boxed);
  if (isInt64Like(value)) {
    const text = String(value);
    const parsed = Number(text);
    return Number.isSafeInteger(parsed) ? parsed : text;
  }
  if (ArrayBuffer.isView(value)) {
    if (value instanceof DataView || value instanceof Uint8Array) {
      const bytes =
        value instanceof DataView
          ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
          : value;
      return {
        $binary: {
          base64: bytesToBase64(bytes),
          byteLength: bytes.byteLength,
        },
      };
    }
    return Array.from(value as NumericTypedArray);
  }
  return value;
}

interface JsonSizeState {
  readonly maxCodeUnits: number;
  readonly seen: Set<object>;
  used: number;
}

function assertFullJsonOutputBound(value: unknown, maxCodeUnits: number): void {
  if (!Number.isSafeInteger(maxCodeUnits) || maxCodeUnits < 2) {
    throw new Error("Raw record JSON output bound must be a safe integer >= 2");
  }
  measureJsonValue(value, {
    maxCodeUnits,
    seen: new Set(),
    used: 0,
  });
}

function measureJsonValue(value: unknown, state: JsonSizeState): void {
  if (value === undefined) return addJsonSize(state, 4);
  if (typeof value === "bigint") {
    const parsed = Number(value);
    return measureJsonValue(
      Number.isSafeInteger(parsed) ? parsed : value.toString(),
      state,
    );
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    return measureJsonString(String(value), state);
  }
  if (typeof value === "function" || typeof value === "symbol") {
    return measureJsonString(String(value), state);
  }
  if (typeof value === "string") return measureJsonString(value, state);
  if (typeof value !== "object" || value === null) {
    return addJsonSize(state, JSON.stringify(value).length);
  }
  const object = value as Record<string, unknown>;
  if (
    "toJSON" in object &&
    typeof (object as { toJSON?: unknown }).toJSON === "function"
  ) {
    throw new EpisodeReadUnsupportedError(
      "raw-record-json-output",
      "Complete message JSON cannot safely serialize custom toJSON values",
    );
  }
  const boxed = boxedPrimitiveValue(value);
  if (boxed !== null) return measureJsonValue(boxed, state);
  if (isInt64Like(value)) {
    const text = String(value);
    const parsed = Number(text);
    return measureJsonValue(
      Number.isSafeInteger(parsed) ? parsed : text,
      state,
    );
  }
  if (ArrayBuffer.isView(value)) {
    if (value instanceof DataView || value instanceof Uint8Array) {
      const byteLength = value.byteLength;
      const emptyEnvelopeLength = JSON.stringify({
        $binary: { base64: "", byteLength },
      }).length;
      return addJsonSize(
        state,
        emptyEnvelopeLength + 4 * Math.ceil(byteLength / 3),
      );
    }
    return measureJsonArrayLike(value as NumericTypedArray, state);
  }

  if (state.seen.has(object)) {
    throw new EpisodeReadUnsupportedError(
      "raw-record-json-output",
      "Complete message JSON cannot serialize cyclic values",
    );
  }
  state.seen.add(object);
  try {
    if (Array.isArray(object)) {
      measureJsonArrayLike(object, state, true);
      return;
    }
    const keys = Object.keys(object);
    addJsonSize(state, 2 + Math.max(0, keys.length - 1));
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      if (!descriptor || !("value" in descriptor)) {
        throwDynamicJsonValue();
      }
      measureJsonString(key, state);
      addJsonSize(state, 1);
      measureJsonValue(descriptor.value, state);
    }
  } finally {
    state.seen.delete(object);
  }
}

function measureJsonArrayLike(
  value: ArrayLike<unknown>,
  state: JsonSizeState,
  requireDataProperties = false,
): void {
  const minimumLength =
    value.length === 0 ? 2 : 2 + value.length + (value.length - 1);
  if (state.used + minimumLength > state.maxCodeUnits) {
    throwFullJsonOutputBound(state.maxCodeUnits);
  }
  addJsonSize(state, 2 + Math.max(0, value.length - 1));
  for (let index = 0; index < value.length; index += 1) {
    let item = value[index];
    if (requireDataProperties) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (descriptor) {
        if (!("value" in descriptor)) throwDynamicJsonValue();
        item = descriptor.value;
      } else if (index in value) {
        throwDynamicJsonValue();
      } else {
        item = undefined;
      }
    }
    measureJsonValue(item, state);
  }
}

function boxedPrimitiveValue(value: object): boolean | number | string | null {
  if (value instanceof Boolean) return Boolean.prototype.valueOf.call(value);
  if (value instanceof Number) return Number.prototype.valueOf.call(value);
  if (value instanceof String) return String.prototype.valueOf.call(value);
  return null;
}

function throwDynamicJsonValue(): never {
  throw new EpisodeReadUnsupportedError(
    "raw-record-json-output",
    "Complete message JSON cannot safely serialize accessor-backed values",
  );
}

function measureJsonString(value: string, state: JsonSizeState): void {
  if (state.used + value.length + 2 > state.maxCodeUnits) {
    throwFullJsonOutputBound(state.maxCodeUnits);
  }
  addJsonSize(state, 2);
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        addJsonSize(state, 2);
        index += 1;
      } else {
        addJsonSize(state, 6);
      }
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      addJsonSize(state, 6);
      continue;
    }
    addJsonSize(
      state,
      code === 0x22 ||
        code === 0x5c ||
        code === 0x08 ||
        code === 0x09 ||
        code === 0x0a ||
        code === 0x0c ||
        code === 0x0d
        ? 2
        : code <= 0x1f
          ? 6
          : 1,
    );
  }
}

function addJsonSize(state: JsonSizeState, amount: number): void {
  state.used += amount;
  if (state.used > state.maxCodeUnits) {
    throwFullJsonOutputBound(state.maxCodeUnits);
  }
}

function throwFullJsonOutputBound(maxCodeUnits: number): never {
  throw new EpisodeReadUnsupportedError(
    "raw-record-json-output",
    `Complete message JSON exceeds the ${maxCodeUnits}-code-unit copy/export limit`,
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 32_766; // divisible by 3, so only the final chunk pads
  const parts: string[] = [];
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    parts.push(btoa(String.fromCharCode(...chunk)));
  }
  return parts.join("");
}

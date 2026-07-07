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
 * Reconstructs plain JSON-ish data from a pruned node tree — the copy
 * payload. Truncations stay legible: cut arrays gain a trailing marker
 * string, cut objects a `"…"` key, bytes render as a summary string.
 */
export function rawNodeToJson(node: McapRawValueNode): unknown {
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
      const out: Record<string, unknown> = {};
      for (const [key, child] of node.entries) {
        out[key] = rawNodeToJson(child);
      }
      if (node.droppedEntries) {
        out["…"] = `${node.droppedEntries} more fields`;
      }
      return out;
    }
    case "truncated":
      return node.reason === "depth" ? "… deeper levels omitted" : "… omitted";
  }
}

function scalarToJson(node: McapRawScalarNode): unknown {
  switch (node.valueType) {
    case "number": {
      const parsed = Number(node.value);
      // Non-finite numbers are not valid JSON; keep the string rendering.
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

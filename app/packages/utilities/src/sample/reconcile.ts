import { JSONDeltas } from "../types";
import { fieldDeltas, SampleSnapshot } from "./diff";
import { equalsNormalized } from "./normalize";
import { getAtPath, getNestedField, withoutPath } from "./pointer";

/**
 * The transient store after a reconcile pass. Returned (rather than mutated in
 * place) so the caller decides when to swap it in and notify.
 */
export interface ReconcileResult {
  readonly transientData: Record<string, unknown>;
}

/** A server-owned field reachable from a persisted op: its absolute pointer and persisted value. */
interface ServerOwnedTarget {
  segments: string[];
  value: unknown;
}

/** The transient entry a sample-rooted pointer addresses, plus the remaining segments into it. */
interface LocatedTransient {
  path: string;
  rest: string[];
}

/**
 * Release server-owned fields from the transient after the given deltas have
 * been successfully persisted, returning the next transient store — or `null`
 * if nothing was released (no-op).
 *
 * Each such field is write-once: once the server accepts it, the backend owns
 * the stored representation (which it may re-encode or relocate to a `*_path`),
 * so the transient must stop re-emitting it and defer to source on the next
 * hydration. Released by value (CAS): a field is dropped only if the transient
 * still holds the exact value that was persisted, so an edit made after the
 * patch was built (e.g. a re-paint while the request was in flight) is
 * preserved.
 *
 * Mirrors Lighter's one-shot `getPendingMask()`; call after a successful
 * persist. Generated-view deltas are label-rooted (no field-path prefix) and
 * match no transient key, so they are no-ops here.
 */
export const reconcilePersisted = (
  snapshot: SampleSnapshot,
  deltas: JSONDeltas,
  serverOwnedFields: ReadonlySet<string>
): ReconcileResult | null => {
  let next: Record<string, unknown> | null = null;

  for (const op of deltas) {
    // Only add/replace ops carry a value (and so a releasable server-owned
    // field); narrowing the discriminated union also types `op.value`.
    if (op.op !== "add" && op.op !== "replace") {
      continue;
    }

    // A server-owned field may be the pointer leaf (`replace .../mask`) or
    // nested inside the op's value (`add .../detections/-` of a whole label),
    // so scan the value, not just the leaf. The id-aligned list diff appends via
    // `/-`, which is opaque positionally — resolve it to the element's real
    // index (matched by `_id`) so the nested mask is still locatable.
    const baseSegments = resolveAppend(
      op.path.split("/").filter(Boolean),
      op.value,
      next ?? snapshot.transientData
    );

    for (const target of serverOwnedTargets(
      serverOwnedFields,
      baseSegments,
      op.value
    )) {
      const located = locateTransient(snapshot.transientData, target.segments);
      if (!located) {
        continue;
      }

      const { path, rest } = located;
      const source = next ?? snapshot.transientData;
      const current = getAtPath(source[path], rest);
      if (!equalsNormalized(current, target.value)) {
        // Re-edited since the patch was built — keep the newer value.
        continue;
      }

      // Copy-on-write along the pointer: at success time the targeted transient
      // element may still be the same object reference as `sourceData` (e.g. an
      // un-edited list sibling), so an in-place delete would corrupt source.
      if (!next) {
        next = { ...snapshot.transientData };
      }
      next[path] = withoutPath(next[path], rest) as Record<string, unknown>;
    }
  }

  if (!next) {
    return null;
  }

  // Drop entries that no longer contribute a diff (e.g. a mask-only edit whose
  // sole changed field was just released).
  for (const path of Object.keys(next)) {
    const sourceValue = getNestedField(snapshot.sourceData, path);
    if (fieldDeltas(snapshot, path, sourceValue, next[path]).length === 0) {
      delete next[path];
    }
  }

  return { transientData: next };
};

/**
 * Resolve a JSON-Patch append token (`-`, emitted by the id-aligned list diff
 * for a whole-element `add`) to the element's real index in the transient,
 * matched by `_id`. Positional reconcile (`getAtPath`) can't walk `-`, so
 * without this the server-owned fields nested in an appended label would never
 * be released. Returns the segments unchanged when there's no trailing `-`, no
 * `_id` on the value, or the element isn't found.
 */
const resolveAppend = (
  segments: string[],
  value: unknown,
  transientData: Readonly<Record<string, unknown>>
): string[] => {
  if (segments[segments.length - 1] !== "-") {
    return segments;
  }

  const id = (value as { _id?: string } | undefined)?._id;
  if (id === undefined) {
    return segments;
  }

  const listSegments = segments.slice(0, -1);
  const located = locateTransient(transientData, listSegments);
  if (!located) {
    return segments;
  }

  const list = getAtPath(transientData[located.path], located.rest);
  if (!Array.isArray(list)) {
    return segments;
  }

  const index = list.findIndex(
    (el) => (el as { _id?: string } | undefined)?._id === id
  );
  if (index < 0) {
    return segments;
  }

  return [...listSegments, String(index)];
};

/**
 * Enumerate every server-owned field reachable from a persisted op, as
 * `{ segments, value }` pairs where `segments` is the absolute pointer to the
 * field and `value` is the persisted value there. Covers both the pointer leaf
 * (`replace .../mask`) and fields nested within the op's value (a whole label
 * `add`). A server-owned value is treated as an opaque leaf payload — recursion
 * stops there.
 */
const serverOwnedTargets = (
  serverOwnedFields: ReadonlySet<string>,
  baseSegments: string[],
  value: unknown
): ServerOwnedTarget[] => {
  const targets: ServerOwnedTarget[] = [];

  const visit = (segments: string[], val: unknown): void => {
    const leaf = segments[segments.length - 1];
    if (leaf !== undefined && serverOwnedFields.has(leaf)) {
      targets.push({ segments, value: val });
      return;
    }
    if (val && typeof val === "object") {
      for (const [key, child] of Object.entries(
        val as Record<string, unknown>
      )) {
        visit([...segments, key], child);
      }
    }
  };

  visit(baseSegments, value);

  return targets;
};

/**
 * Find the transient entry a sample-rooted JSON pointer addresses, returning
 * the transient key (dot path) and the remaining pointer segments into its
 * value. Picks the longest matching key prefix.
 */
const locateTransient = (
  transientData: Readonly<Record<string, unknown>>,
  segments: string[]
): LocatedTransient | undefined => {
  let best: LocatedTransient | undefined;

  for (const path of Object.keys(transientData)) {
    const keySegs = path.split(".");
    if (keySegs.length >= segments.length) {
      continue;
    }
    if (!keySegs.every((s, i) => s === segments[i])) {
      continue;
    }
    if (!best || keySegs.length > best.path.split(".").length) {
      best = { path, rest: segments.slice(keySegs.length) };
    }
  }

  return best;
};

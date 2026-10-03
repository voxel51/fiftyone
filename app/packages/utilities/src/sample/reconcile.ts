import { JSONDeltas } from "../types";
import { fieldDeltas, SampleSnapshot } from "./diff";
import { LabelData, LIST_LABEL_CHILD } from "./labels";
import { equalsNormalized } from "./normalize";
import {
  getAtPath,
  getNestedField,
  withoutPath,
  withValueAtPath,
} from "./pointer";

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
 * After a successful persist, release transient fields that should now defer to
 * source, returning the next transient store — or `null` if nothing changed.
 * Two releases:
 *
 * 1. Server-owned fields (e.g. masks): write-once, the backend owns the stored
 *    form after accepting them, so the transient must stop re-emitting them.
 *    Released by value — kept if the transient diverges from the persisted value
 *    (re-edited while the request was in flight).
 *
 * 2. View-projected label fields: a `set_field` stage can project a value onto a
 *    label sub-field the user never edited; it rides into the transient from the
 *    view-loaded sample and, after the save refreshes source to the DB value,
 *    re-diffs against it and clobbers it. So release each list-label sub-field
 *    the deltas did not touch and that is unchanged from `patchBaseline` (the
 *    transient when the patch was built) — a field changed since then is a live
 *    in-flight edit and is kept. `null` baseline releases nothing (fail safe).
 */
export const reconcilePersisted = (
  snapshot: SampleSnapshot,
  deltas: JSONDeltas,
  serverOwnedFields: ReadonlySet<string>,
  patchBaseline: Readonly<Record<string, unknown>> | null = null,
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
      next ?? snapshot.transientData,
    );

    for (const target of serverOwnedTargets(
      serverOwnedFields,
      baseSegments,
      op.value,
    )) {
      const located = locateTransient(snapshot.transientData, target.segments);
      if (!located) {
        continue;
      }

      const { path, rest } = located;
      const source = next ?? snapshot.transientData;
      const current = getAtPath(source[path], rest);
      // the compared values are bare (no wrapping object), so the segment
      // leaf — the server-owned field's name — seeds the key context for
      // the gated non-finite string collapse
      if (
        !equalsNormalized(
          current,
          target.value,
          target.segments[target.segments.length - 1],
        )
      ) {
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

  // second release: defer un-touched list-label sub-fields to the refreshed
  // source. Runs on the post-server-owned transient so the passes compose.
  next = releaseUneditedLabelFields(snapshot, deltas, next, patchBaseline);

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

/** The list child elements of a list-label parent value, by `_id`. */
const elementsById = (
  parentValue: unknown,
  child: string,
): Map<string, LabelData> => {
  const byId = new Map<string, LabelData>();
  const list = (parentValue as Record<string, unknown> | undefined)?.[child];

  if (Array.isArray(list)) {
    for (const el of list as LabelData[]) {
      if (el?._id) {
        byId.set(el._id, el);
      }
    }
  }

  return byId;
};

/**
 * The list child elements of a list-label parent, by array index — matched
 * element diff ops are rooted at the element's SOURCE index, so we resolve a
 * delta's index back to its `_id` against this map.
 */
const elementsByIndex = (
  parentValue: unknown,
  child: string,
): (LabelData | undefined)[] => {
  const list = (parentValue as Record<string, unknown> | undefined)?.[child];
  return Array.isArray(list) ? (list as LabelData[]) : [];
};

/**
 * The second release of {@link reconcilePersisted}: for each list-label element
 * a delta edited, defer the sub-fields the deltas did NOT persist (other than
 * `_id`) to the refreshed source — overwrite them with the source element's
 * value, or drop the key when the source has none. Overwriting (vs deleting)
 * keeps the transient entry a fully-resolved value: readers
 * (`getResolved`/`getLabel`) return transient entries verbatim, so a
 * key-deletion here would surface a partial label (no `label`, `_cls`, ...) to
 * every consumer whenever an in-flight edit keeps the entry alive past the
 * reconcile. The diff is unaffected either way — an equal or absent field
 * contributes no delta. Only fields present on the element are released, so a
 * key the server-owned pass above removed is never re-introduced.
 * Newly-created elements (no source counterpart) are kept verbatim.
 *
 * Value-CAS against `patchBaseline` (the transient when the patch was built):
 * release a candidate only if its current value is unchanged since then, so a
 * field edited in the patch's in-flight window is kept. No baseline → release
 * nothing.
 */
const releaseUneditedLabelFields = (
  snapshot: SampleSnapshot,
  deltas: JSONDeltas,
  next: Record<string, unknown> | null,
  patchBaseline: Readonly<Record<string, unknown>> | null,
): Record<string, unknown> | null => {
  // No T0 baseline → cannot tell stale from in-flight; release nothing.
  if (!patchBaseline) {
    return next;
  }

  // Per (transient field key, element _id): the top-level element sub-fields a
  // delta touched — those are the user's edits and are never released.
  const touched = new Map<string, Set<string>>();
  const touchKey = (path: string, id: string) => `${path}\u0000${id}`;

  for (const op of deltas) {
    if (op.op === "remove") {
      continue;
    }

    const located = locateTransient(
      snapshot.transientData,
      op.path.split("/").filter(Boolean),
    );

    if (!located) {
      continue;
    }

    const child = LIST_LABEL_CHILD[snapshot.getLabelType(located.path)];

    // rest = [child, index, subfield, ...]; we only handle matched-element ops
    // addressing a concrete list child + index + sub-field.
    if (!child || located.rest.length < 3 || located.rest[0] !== child) {
      continue;
    }

    const index = Number(located.rest[1]);
    const subfield = located.rest[2];

    if (!Number.isInteger(index) || index < 0) {
      continue;
    }

    // matched ops are source-indexed; resolve the element id from source, then
    // fall back to the current transient list (e.g. an append resolved to its
    // real index by resolveAppend upstream).
    const source = next ?? snapshot.transientData;
    const id =
      elementsByIndex(getNestedField(snapshot.sourceData, located.path), child)[
        index
      ]?._id ?? elementsByIndex(source[located.path], child)[index]?._id;

    if (!id) {
      continue;
    }

    const key = touchKey(located.path, id);
    const set = touched.get(key) ?? new Set<string>();
    set.add(subfield);
    touched.set(key, set);
  }

  let result = next;

  for (const path of new Set(
    [...touched.keys()].map((k) => k.split("\u0000")[0]),
  )) {
    const child = LIST_LABEL_CHILD[snapshot.getLabelType(path)];

    if (!child) {
      continue;
    }

    const source = result ?? snapshot.transientData;
    const sourceById = elementsById(
      getNestedField(snapshot.sourceData, path),
      child,
    );
    // T0 baseline element values, matched by _id — the CAS reference.
    const baselineById = elementsById(patchBaseline[path], child);
    const transientList = elementsByIndex(source[path], child);

    transientList.forEach((element, index) => {
      const id = element?._id;

      if (!id) {
        return;
      }

      const editedFields = touched.get(touchKey(path, id));

      if (!editedFields) {
        return;
      }

      // a newly-created element has no source counterpart — nothing to defer
      // to, so keep its fields verbatim.
      if (!sourceById.has(id)) {
        return;
      }

      const baselineElement = baselineById.get(id) as
        | Record<string, unknown>
        | undefined;
      const sourceElement = sourceById.get(id) as Record<string, unknown>;

      // release each sub-field outside the delta set (keep `_id` + persisted
      // fields) by deferring it to the refreshed source; composes with the
      // server-owned pass, which already removed its own fields.
      for (const field of Object.keys(element as Record<string, unknown>)) {
        if (field === "_id" || editedFields.has(field)) {
          continue;
        }

        // value-CAS: only release a field unchanged from its T0 baseline. A
        // field changed in the patch's in-flight window (or absent at T0) is a
        // live edit — keep it. The values are bare, so `field` seeds the key
        // context for the gated non-finite string collapse.
        if (
          !equalsNormalized(
            (element as Record<string, unknown>)[field],
            baselineElement?.[field],
            field,
          )
        ) {
          continue;
        }

        if (!result) {
          result = { ...snapshot.transientData };
        }

        const sourceValue = sourceElement[field];
        result[path] =
          sourceValue === undefined
            ? withoutPath(result[path], [child, String(index), field])
            : withValueAtPath(
                result[path],
                [child, String(index), field],
                sourceValue,
              );
      }
    });
  }

  return result;
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
  transientData: Readonly<Record<string, unknown>>,
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
    (el) => (el as { _id?: string } | undefined)?._id === id,
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
  value: unknown,
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
        val as Record<string, unknown>,
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
  segments: string[],
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

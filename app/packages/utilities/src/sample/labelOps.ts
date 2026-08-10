/**
 * Classify a persisted JSON Patch into per-label operations.
 *
 * Every label save (add / edit / delete, autosave included) flows through
 * `doPatchSample` as RFC-6902 deltas against the sample document, e.g.:
 *
 *   {op: "replace", path: "/ground_truth/detections/0/bounding_box/3"}  edit
 *   {op: "remove",  path: "/ground_truth/detections/4"}                 delete
 *   {op: "add",     path: "/ground_truth/detections/-", value: {...}}   add
 *
 * This module turns one such patch into `{added, deleted, modified}` label-id
 * sets for Activity Analytics (the submit-time label delta + the per-label
 * activity trail — see the activity-analytics KB, `time-tracking-events.md`).
 *
 * Classification is per LABEL ELEMENT, not per op: a bbox drag emits several
 * `replace` ops on one detection and must count as ONE modified label. The
 * element boundary is the prefix through the first numeric (or `-`) path
 * segment for list labels, or the field itself for single-label fields.
 *
 * Unresolvable label ids are skipped — an undercount is acceptable for
 * analytics; a fabricated id is not.
 */

import type { JSONDeltas } from "../types";
import { getAtPath } from "./pointer";

export interface LabelOpsSummary {
  added: string[];
  deleted: string[];
  modified: string[];
  /** Sample field each label lives in (e.g. "ground_truth"), by label id. */
  fieldOf: Record<string, string>;
  /**
   * Instance identity by label id, where one exists (video temporal
   * labels): the shared ``instance`` id, else ``field#track<index>`` for
   * tracking-style labels. Consumers count/dedupe by
   * ``instanceOf[id] ?? id`` so one temporal detection materialized
   * across N frames reads as ONE label, while events keep the true
   * per-frame label id (FOEPD-4344 follow-up).
   */
  instanceOf: Record<string, string>;
}

/** True when the summary carries no operations. */
export const isEmptyLabelOps = (ops: LabelOpsSummary): boolean =>
  ops.added.length === 0 &&
  ops.deleted.length === 0 &&
  ops.modified.length === 0;

const NUMERIC = /^\d+$/;

const isElementSegment = (segment: string): boolean =>
  segment === "-" || NUMERIC.test(segment);

/** Path segments for a JSON pointer ("/a/b/0" → ["a", "b", "0"]). */
const segmentsOf = (pointer: string): string[] =>
  pointer
    .split("/")
    .slice(1)
    .filter((segment) => segment.length > 0);

/**
 * The label-element prefix of a delta path: through the first numeric
 * segment for list labels, else the bare field for single-label fields.
 */
const elementSegments = (segments: string[]): string[] => {
  for (let i = 0; i < segments.length; i++) {
    if (isElementSegment(segments[i])) {
      // Video paths nest the label under a frame: /frames/<n>/<field>/…
      // — the frame index is an INTERMEDIATE segment, not the label
      // element. Continue to the next numeric segment (list label) or
      // the frame's field (single-label).
      if (i === 1 && segments[0] === "frames") {
        for (let j = i + 1; j < segments.length; j++) {
          if (isElementSegment(segments[j])) {
            return segments.slice(0, j + 1);
          }
        }
        return segments.slice(0, Math.min(3, segments.length));
      }
      return segments.slice(0, i + 1);
    }
  }
  return segments.slice(0, 1);
};

const labelIdOf = (candidate: unknown): string | null => {
  if (candidate && typeof candidate === "object") {
    const record = candidate as Record<string, unknown>;
    const id = record._id ?? record.id;
    if (typeof id === "string" && id) return id;
    // Extended-JSON object ids ({$oid: "..."}) survive some transforms.
    if (id && typeof id === "object") {
      const oid = (id as Record<string, unknown>).$oid;
      if (typeof oid === "string" && oid) return oid;
    }
  }
  return null;
};

/**
 * Instance-level identity for a VIDEO frame label (FOEPD-4344 follow-up).
 *
 * A temporal detection is one logical label materialized as one document
 * per frame — a single gesture adds dozens of per-frame ids. Managers
 * read "labels" at the INSTANCE level, so frame labels identify by their
 * shared ``instance`` id (or, for older tracking-style labels, by
 * ``field + index``) and every per-frame op on the same instance folds
 * into one added/deleted/modified entry. Frame labels with neither
 * tracking field keep their per-frame id (each frame genuinely is its
 * own label then).
 */
const frameLabelIdentity = (
  node: unknown,
  field: string | undefined,
): string | null => {
  if (!node || typeof node !== "object") return null;
  const record = node as Record<string, unknown>;
  const instanceId = labelIdOf(record.instance);
  if (instanceId) return instanceId;
  if (typeof record.index === "number" && field) {
    return `${field}#track${record.index}`;
  }
  return null;
};

/**
 * Every label id in a whole-field value: the label itself, or the labels
 * inside a container field (`{classifications: [...]}`, `{detections:
 * [...]}`). Whole-field ops carry these shapes — a classification set from
 * the annotate sidebar arrives as one add/replace of the field, and
 * resolving only the top object's id (which containers don't have) made
 * those saves invisible (FOEPD-4344).
 */
const collectLabelIds = (node: unknown, depth = 2): string[] => {
  const direct = labelIdOf(node);
  if (direct) return [direct];
  if (depth <= 0 || !node || typeof node !== "object") return [];
  const out: string[] = [];
  const children = Array.isArray(node)
    ? node
    : Object.values(node as Record<string, unknown>);
  for (const child of children) {
    if (!child || typeof child !== "object") continue;
    const id = labelIdOf(child);
    if (id) {
      out.push(id);
    } else if (Array.isArray(child)) {
      out.push(...collectLabelIds(child, depth - 1));
    }
  }
  return out;
};

export interface ClassifyLabelOpsArgs {
  deltas: JSONDeltas;
  /** The sample BEFORE the patch (source for deleted/modified ids). */
  preSample: unknown;
  /** The sample AFTER the patch (source for added ids). */
  postSample?: unknown;
  /** Field-level fast path: the single label the patch targets. */
  labelId?: string;
  /** Field-level fast path: "mutate" | "delete". */
  opType?: string;
}

/**
 * Classifies one persisted patch into deduped per-label operation sets.
 */
export const classifyLabelOps = ({
  deltas,
  preSample,
  postSample,
  labelId,
  opType,
}: ClassifyLabelOpsArgs): LabelOpsSummary => {
  const added = new Set<string>();
  const deleted = new Set<string>();
  const modified = new Set<string>();
  const fieldOf: Record<string, string> = {};
  const instanceOf: Record<string, string> = {};

  // Field-level updates name their label outright — trust that.
  if (labelId) {
    if (opType === "delete") {
      deleted.add(labelId);
    } else if (
      deltas.some(
        (delta) =>
          delta.op === "add" &&
          isElementTail(segmentsOf(delta.path)) &&
          labelIdOf((delta as { value?: unknown }).value) === labelId,
      ) ||
      !fastPathPreExisting(deltas, preSample, labelId)
    ) {
      // Explicit list add, or the label is absent from the pre-patch
      // sample: a whole-field set of a new classification arrives as one
      // add/replace of the field and must count as ADDED, not modified
      // (FOEPD-4344).
      added.add(labelId);
    } else {
      modified.add(labelId);
    }
    const field = deltas.length ? segmentsOf(deltas[0].path)[0] : undefined;
    if (field) fieldOf[labelId] = field;
    return toSummary(added, deleted, modified, fieldOf, instanceOf);
  }

  // RFC-6902 ops apply SEQUENTIALLY: `remove /f/detections/1` twice
  // deletes the pre-patch elements at index 1 THEN 2 (indices shift as
  // each op lands). Resolving every op against the untouched preSample
  // would attribute the second remove to the first element again, so
  // each touched array's id list is replayed op by op.
  const arrayIds = new Map<string, (string | null)[]>();
  const idsFor = (prefix: string[]): (string | null)[] | null => {
    const key = prefix.join("/");
    const cached = arrayIds.get(key);
    if (cached) return cached;
    const node = getAtPath(preSample, prefix);
    if (!Array.isArray(node)) return null;
    const ids = node.map((entry) => labelIdOf(entry));
    arrayIds.set(key, ids);
    return ids;
  };

  for (const delta of deltas) {
    const segments = segmentsOf(delta.path);
    if (segments.length === 0) continue;
    const element = elementSegments(segments);
    const exactlyElement = element.length === segments.length;
    const last = element[element.length - 1];
    const isListElement = element.length > 1 && isElementSegment(last);
    const ids = isListElement ? idsFor(element.slice(0, -1)) : null;
    const index =
      last === "-" ? (ids ? ids.length : -1) : Number.parseInt(last, 10);
    const shifted = ids && index >= 0 && index < ids.length ? ids[index] : null;
    // Video frame paths: attribute ops to the label FIELD (element[2] in
    // /frames/<n>/<field>/…), not the literal "frames" container, and
    // prefer the instance identity over the per-frame document id.
    const isFrame = element[0] === "frames" && element.length >= 3;
    const opField = isFrame ? element[2] : element[0];
    const noteInstance = (id: string | null, node: unknown) => {
      if (!id || !isFrame) return;
      const identity = frameLabelIdentity(node, opField);
      if (identity) instanceOf[id] = identity;
    };

    if (delta.op === "add" && exactlyElement) {
      // New label(s): ids ride in the op's own value — directly for a list
      // element, inside the container for a whole-field add (a
      // classification set from the sidebar arrives as one field-level op).
      const value = (delta as { value?: unknown }).value;
      let opIds = collectLabelIds(value);
      if (!opIds.length) {
        const resolved = resolveId(postSample, element);
        if (resolved) opIds = [resolved];
      }
      if (opIds.length === 1) {
        noteInstance(opIds[0], value ?? getAtPath(postSample, element));
      }
      for (const id of opIds) {
        added.add(id);
        fieldOf[id] = opField;
      }
      if (ids && index >= 0) ids.splice(index, 0, opIds[0] ?? null);
    } else if (delta.op === "remove" && exactlyElement) {
      // Deleted label(s): the SHIFTED array state names a list element; a
      // whole-field remove names every label still in the pre-patch field.
      let opIds = shifted
        ? [shifted]
        : isListElement
          ? []
          : collectLabelIds(getAtPath(preSample, element));
      if (opIds.length === 1) {
        noteInstance(opIds[0], getAtPath(preSample, element));
      }
      for (const id of opIds) {
        deleted.add(id);
        fieldOf[id] = opField;
      }
      if (ids && index >= 0 && index < ids.length) ids.splice(index, 1);
    } else if (delta.op === "replace" && exactlyElement && !isListElement) {
      // Whole-field replace: an add when the field was empty, a delete
      // when it is being cleared, and modified/moved labels otherwise —
      // diff the pre and post label-id sets rather than guessing
      // (a classification "set" on a pre-existing null field lands here).
      // The op value may be a skeleton without ids — the post-patch
      // sample is the fallback source for what now lives in the field.
      const preIds = new Set(collectLabelIds(getAtPath(preSample, element)));
      let postIds = collectLabelIds((delta as { value?: unknown }).value);
      if (!postIds.length) {
        postIds = collectLabelIds(getAtPath(postSample, element));
      }
      for (const id of postIds) {
        if (preIds.has(id)) modified.add(id);
        else added.add(id);
        fieldOf[id] = element[0];
      }
      const postSet = new Set(postIds);
      for (const id of preIds) {
        if (!postSet.has(id)) {
          deleted.add(id);
          fieldOf[id] = element[0];
        }
      }
    } else {
      // Anything deeper (or replace at the element) edits a label; the
      // shifted state resolves it, else the samples. A label absent from
      // the PRE state that the POST state resolves was created by this
      // patch (a skeleton add + per-property sets never carries the id
      // in any single op) — that is an ADD, not an edit (FOEPD-4344).
      const preId = shifted ?? resolveId(preSample, element);
      const id = preId ?? resolveId(postSample, element);
      if (id) {
        noteInstance(
          id,
          getAtPath(preSample, element) ?? getAtPath(postSample, element),
        );
        if (preId) {
          modified.add(id);
        } else {
          added.add(id);
        }
        fieldOf[id] = opField;
      }
    }
  }

  return toSummary(added, deleted, modified, fieldOf, instanceOf);
};

const isElementTail = (segments: string[]): boolean =>
  segments.length > 0 && isElementSegment(segments[segments.length - 1]);

/** Whether the fast path's label already exists in the pre-patch sample. */
const fastPathPreExisting = (
  deltas: JSONDeltas,
  preSample: unknown,
  labelId: string,
): boolean => {
  if (!deltas.length) return true; // no path to check — assume edit
  const element = elementSegments(segmentsOf(deltas[0].path));
  const container =
    element.length > 1 && isElementSegment(element[element.length - 1])
      ? element.slice(0, -1)
      : element;
  return collectLabelIds(getAtPath(preSample, container)).includes(labelId);
};

const resolveId = (sample: unknown, element: string[]): string | null => {
  if (!sample) return null;
  const node = getAtPath(sample, element);
  const direct = labelIdOf(node);
  if (direct) return direct;
  // Single-label fields sometimes nest the label one level down
  // (e.g. {classification: {...}}); accept an only-child with an id.
  if (node && typeof node === "object" && !Array.isArray(node)) {
    const values = Object.values(node as Record<string, unknown>);
    for (const value of values) {
      const id = labelIdOf(value);
      if (id) return id;
    }
  }
  return null;
};

const toSummary = (
  added: Set<string>,
  deleted: Set<string>,
  modified: Set<string>,
  fieldOf: Record<string, string>,
  instanceOf: Record<string, string> = {},
): LabelOpsSummary => ({
  added: [...added],
  // A label both added and removed by ONE patch was moved (e.g. re-homed
  // from its staging field on first save) — it survives the patch, so
  // reporting the remove would poison the session netting into "add then
  // delete = no work" (FOEPD-4344).
  deleted: [...deleted].filter((id) => !added.has(id)),
  // A label added or deleted in the same patch is not ALSO modified.
  modified: [...modified].filter((id) => !added.has(id) && !deleted.has(id)),
  fieldOf,
  instanceOf,
});

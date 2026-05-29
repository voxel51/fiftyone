import { atom, useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import type { RawTemporalDetectionsField } from "./temporalDetectionTracks";

/**
 * Field-keyed partial for a single TD edit. `null` attribute removes it.
 *
 * `support` is the underlying `[first, last]` frame range; `first`/`last`
 * are the sidebar-editable endpoints that fold back into `support` at
 * apply/persist time. Timeline drag writes `support` directly; sidebar
 * form changes write `first`/`last`. Either pathway converges on a
 * single `support: [first, last]` value when reaching the document.
 */
export interface TemporalDetectionEditFields {
  support?: [number, number];
  first?: number;
  last?: number;
  label?: string;
  confidence?: number;
  attributes?: Record<string, unknown | null>;
}

const pendingTemporalDetectionEditsAtom = atom<
  ReadonlyMap<string, TemporalDetectionEditFields>
>(new Map());

export const temporalDetectionEditKey = (
  fieldPath: string,
  detectionId: string
): string => `${fieldPath}|${detectionId}`;

export const parseTemporalDetectionEditKey = (
  key: string
): { fieldPath: string; detectionId: string } => {
  const sep = key.indexOf("|");
  return {
    fieldPath: key.slice(0, sep),
    detectionId: key.slice(sep + 1),
  };
};

export const useTemporalDetectionPendingEdits = (): ReadonlyMap<
  string,
  TemporalDetectionEditFields
> => useAtomValue(pendingTemporalDetectionEditsAtom);

/**
 * Merge an edit onto any prior staged entry for the same TD. Per-field
 * merge so a label change doesn't drop a previously-staged support, and
 * vice versa. `attributes` deep-merges by key.
 */
export const useStageTemporalDetectionEdit = (): ((
  fieldPath: string,
  detectionId: string,
  update: TemporalDetectionEditFields
) => void) => {
  const set = useSetAtom(pendingTemporalDetectionEditsAtom);

  return useCallback(
    (fieldPath, detectionId, update) => {
      set((prev) => {
        const next = new Map(prev);
        const key = temporalDetectionEditKey(fieldPath, detectionId);
        const existing = prev.get(key);
        next.set(key, mergeEdit(existing, update));
        return next;
      });
    },
    [set]
  );
};

export const useClearTemporalDetectionEdits = (): (() => void) => {
  const set = useSetAtom(pendingTemporalDetectionEditsAtom);
  return useCallback(() => {
    set(new Map());
  }, [set]);
};

/**
 * Shallow-cloned `sample` with staged TD edits applied. Existing TDs
 * get per-field override (`support`/`label`/`confidence` plus attr
 * merge, `null` removes). Staged entries whose `_id` isn't on the
 * sample (i.e. newly-created TDs) are appended as synthetic docs.
 * Entries targeting a missing field, or missing `support` for a
 * synthetic doc, are skipped.
 */
export const applyTemporalDetectionEdits = (
  sample: Record<string, unknown>,
  edits: ReadonlyMap<string, TemporalDetectionEditFields>
): Record<string, unknown> => {
  if (edits.size === 0) {
    return sample;
  }

  const editsByField = new Map<
    string,
    Map<string, TemporalDetectionEditFields>
  >();
  for (const [key, fields] of edits) {
    const { fieldPath, detectionId } = parseTemporalDetectionEditKey(key);
    let fieldEdits = editsByField.get(fieldPath);
    if (!fieldEdits) {
      fieldEdits = new Map();
      editsByField.set(fieldPath, fieldEdits);
    }
    fieldEdits.set(detectionId, fields);
  }

  const next = { ...sample };
  for (const [fieldPath, fieldEdits] of editsByField) {
    const field = next[fieldPath] as RawTemporalDetectionsField | undefined;
    if (!field || field._cls !== "TemporalDetections") {
      continue;
    }
    const detections = Array.isArray(field.detections) ? field.detections : [];

    const seenIds = new Set<string>();
    const overlaid = detections.map((d) => {
      const id = d._id ?? d.id;
      if (!id) return d;
      seenIds.add(id);
      const update = fieldEdits.get(id);
      return update ? applyFields(d, update) : d;
    });

    const appended: Record<string, unknown>[] = [];
    for (const [detectionId, update] of fieldEdits) {
      if (seenIds.has(detectionId)) continue;
      const synthetic = buildSyntheticDetection(detectionId, update);
      if (synthetic) appended.push(synthetic);
    }

    next[fieldPath] = {
      ...field,
      detections: [...overlaid, ...appended],
    };
  }

  return next;
};

/** First sample-level field whose `_cls` is `TemporalDetections`. */
export const firstTemporalDetectionFieldPath = (
  sample: Record<string, unknown> | null | undefined
): string | null => {
  if (!sample) return null;
  for (const [path, value] of Object.entries(sample)) {
    if (
      value &&
      typeof value === "object" &&
      (value as { _cls?: unknown })._cls === "TemporalDetections"
    ) {
      return path;
    }
  }
  return null;
};

function mergeEdit(
  existing: TemporalDetectionEditFields | undefined,
  update: TemporalDetectionEditFields
): TemporalDetectionEditFields {
  if (!existing) return { ...update };
  const merged: TemporalDetectionEditFields = { ...existing };
  if (update.support !== undefined) merged.support = update.support;
  if (update.first !== undefined) merged.first = update.first;
  if (update.last !== undefined) merged.last = update.last;
  if (update.label !== undefined) merged.label = update.label;
  if (update.confidence !== undefined) merged.confidence = update.confidence;
  if (update.attributes !== undefined) {
    merged.attributes = { ...existing.attributes, ...update.attributes };
  }
  return merged;
}

function applyFields(
  detection: Record<string, unknown>,
  update: TemporalDetectionEditFields
): Record<string, unknown> {
  const next = { ...detection };
  const support = resolveSupport(update, next.support as
    | [number, number]
    | undefined);
  if (support !== undefined) next.support = support;
  if (update.label !== undefined) next.label = update.label;
  if (update.confidence !== undefined) next.confidence = update.confidence;
  if (update.attributes) {
    for (const [key, value] of Object.entries(update.attributes)) {
      if (value === null) {
        delete next[key];
      } else {
        next[key] = value;
      }
    }
  }
  return next;
}

/**
 * Fold `support` / `first` / `last` into a single `[first, last]` pair.
 * `first`/`last` take precedence over `support` when both are present.
 * Returns `undefined` when nothing about the range changed.
 */
export function resolveSupport(
  update: TemporalDetectionEditFields,
  baseline: [number, number] | undefined
): [number, number] | undefined {
  const hasEndpoint = update.first !== undefined || update.last !== undefined;
  if (!hasEndpoint) return update.support;

  const fallback = update.support ?? baseline;
  const first = update.first ?? fallback?.[0];
  const last = update.last ?? fallback?.[1];
  if (first === undefined || last === undefined) return undefined;
  return [first, last];
}

/**
 * Build the BSON-shaped detection from a staged entry for a TD that
 * doesn't exist on the sample yet. Requires a resolvable `[first, last]`
 * support range — without it the TD is malformed; skip rather than emit
 * garbage.
 */
function buildSyntheticDetection(
  detectionId: string,
  update: TemporalDetectionEditFields
): Record<string, unknown> | null {
  const support = resolveSupport(update, undefined);
  if (!support) return null;
  const out: Record<string, unknown> = {
    _cls: "TemporalDetection",
    _id: detectionId,
    support,
  };
  if (update.label !== undefined) out.label = update.label;
  if (update.confidence !== undefined) out.confidence = update.confidence;
  if (update.attributes) {
    for (const [k, v] of Object.entries(update.attributes)) {
      if (v !== null) out[k] = v;
    }
  }
  return out;
}

import { atom, useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import type { RawTemporalDetectionsField } from "./temporalDetectionTracks";

/** Field-keyed partial for a single TD edit. `null` attribute removes it. */
export interface TemporalDetectionEditFields {
  support?: [number, number];
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
 * Shallow-cloned `sample` with staged TD edits applied. Per-field
 * override (`support`/`label`/`confidence`) plus attribute merge
 * (`null` removes). Edits whose field / detection no longer exist
 * are silently skipped.
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
    const detections = field?.detections;
    if (!Array.isArray(detections)) {
      continue;
    }

    next[fieldPath] = {
      ...field,
      detections: detections.map((d) => {
        const id = d._id ?? d.id;
        const update = id ? fieldEdits.get(id) : undefined;
        return update ? applyFields(d, update) : d;
      }),
    };
  }

  return next;
};

function mergeEdit(
  existing: TemporalDetectionEditFields | undefined,
  update: TemporalDetectionEditFields
): TemporalDetectionEditFields {
  if (!existing) return { ...update };
  const merged: TemporalDetectionEditFields = { ...existing };
  if (update.support !== undefined) merged.support = update.support;
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
  if (update.support !== undefined) next.support = update.support;
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

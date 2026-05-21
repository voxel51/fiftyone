import { useLighter } from "@fiftyone/lighter";
import type { AnnotationLabel } from "@fiftyone/state";
import { atom, type PrimitiveAtom, useAtomValue, useSetAtom } from "jotai";
import { atomFamily, useAtomCallback } from "jotai/utils";
import { countBy, maxBy } from "lodash";
import { useCallback, useMemo } from "react";
import { isFieldReadOnly, labelSchemaData } from "../../state";
import { labelsByPath } from "../../useLabels";
import {
  current,
  currentData,
  currentField,
  currentFieldIsReadOnlyAtom,
  currentOverlay,
  currentType,
  defaultField,
  editing,
  fieldsOfType,
  hasChanges,
  isEditing as isEditingAtom,
  isNew as isNewAtom,
  type LabelType,
  savedLabel,
} from "../state";
import { activePrimitiveAtom } from "../useActivePrimitive";
import { type CreateOptions, createNewLabel } from "./createNew";

export type { CreateOptions };

/**
 * Per-type memory of the last field the user annotated into.
 *
 * Why: when a user creates several detections in a row, we want each new
 * detection to default to the same field they used last; same for
 * segmentation, polyline, etc.
 */
const lastUsedFieldAtom = atomFamily(
  (_type: LabelType) =>
    atom<string | null>(null) as PrimitiveAtom<string | null>
);

/**
 * Per-field memory of the last class the user assigned.
 *
 * Why: separate atoms per field so switching between `ground_truth.detections`
 * and `predictions.detections` doesn't clobber each field's last-used class.
 */
const lastUsedLabelAtom = atomFamily(
  (_field: string) =>
    atom<string | null>(null) as PrimitiveAtom<string | null>
);

export interface AnnotationContextSelected {
  label: AnnotationLabel | null;
  data: AnnotationLabel["data"] | null;
  field: string | null;
  type: LabelType | null;
  overlay: AnnotationLabel["overlay"] | undefined;
  savedData: AnnotationLabel["data"] | null;
  isEditing: boolean;
  isNew: boolean;
  hasChanges: boolean;
  isFieldReadOnly: boolean;
  /**
   * Set internally by {@link AnnotationContext.createNew} when no schema
   * fields exist for the requested type — surfaces the "string-form" of the
   * underlying `editing` atom so the AddSchema UI can mount.
   */
  pendingNewType: LabelType | null;
}

export interface AnnotationContext {
  selected: AnnotationContextSelected;

  setData: (
    data: Partial<AnnotationLabel["data"]>,
    options?: { replace?: boolean }
  ) => void;
  setField: (path: string) => void;

  select: (labelAtom: PrimitiveAtom<AnnotationLabel>) => void;
  createNew: (
    type: LabelType,
    overrides?: CreateOptions
  ) => AnnotationLabel | null;
  clear: () => void;

  lastUsed: {
    fieldFor: (type: LabelType) => string | null;
    labelFor: (fieldPath: string) => string | null;
    recordField: (type: LabelType, path: string) => void;
    recordLabel: (path: string, label: string) => void;
  };
}

export const useAnnotationContext = (): AnnotationContext => {
  const { scene, addOverlay, overlayFactory } = useLighter();

  const label = useAtomValue(current);
  const data = useAtomValue(currentData);
  const field = useAtomValue(currentField);
  const type = useAtomValue(currentType);
  const overlay = useAtomValue(currentOverlay);
  const savedData = useAtomValue(savedLabel);
  const isEditing = useAtomValue(isEditingAtom);
  const isNew = useAtomValue(isNewAtom);
  const dirty = useAtomValue(hasChanges);
  const fieldReadOnly = useAtomValue(currentFieldIsReadOnlyAtom);
  const editingValue = useAtomValue(editing);
  const pendingNewType =
    typeof editingValue === "string" ? (editingValue as LabelType) : null;

  const selected = useMemo<AnnotationContextSelected>(
    () => ({
      label,
      data,
      field: field ?? null,
      type,
      overlay,
      savedData,
      isEditing,
      isNew: Boolean(isNew),
      hasChanges: dirty,
      isFieldReadOnly: fieldReadOnly,
      pendingNewType,
    }),
    [
      data,
      dirty,
      field,
      fieldReadOnly,
      isEditing,
      isNew,
      label,
      overlay,
      pendingNewType,
      savedData,
      type,
    ]
  );

  const writeData = useSetAtom(currentData);
  const writeField = useSetAtom(currentField);
  const setEditing = useSetAtom(editing);
  const setSaved = useSetAtom(savedLabel);
  const setActivePrimitive = useSetAtom(activePrimitiveAtom);

  const recordCurrentToLastUsed = useAtomCallback(
    useCallback((get, set) => {
      const c = get(current);
      const t = get(currentType);
      if (!c || !t) return;
      set(lastUsedFieldAtom(t), c.path);
      if (c.data?.label) {
        set(lastUsedLabelAtom(c.path), c.data.label as string);
      }
    }, [])
  );

  const writeLastUsedField = useAtomCallback(
    useCallback(
      (_get, set, t: LabelType, path: string) =>
        set(lastUsedFieldAtom(t), path),
      []
    )
  );
  const writeLastUsedLabel = useAtomCallback(
    useCallback(
      (_get, set, path: string, value: string) =>
        set(lastUsedLabelAtom(path), value),
      []
    )
  );

  // Auto-assign chain: remembered → most-populated field of `type` →
  // defaultField(type). Skip a remembered field that is now read-only.
  const computeFieldFor = useAtomCallback(
    useCallback((get, _set, t: LabelType): string | null => {
      const remembered = get(lastUsedFieldAtom(t));
      if (remembered) {
        const s = get(labelSchemaData(remembered));
        if (!isFieldReadOnly(s)) return remembered;
      }

      const byPath = get(labelsByPath);
      let bestPath: string | null = null;
      let bestCount = 0;
      for (const path of get(fieldsOfType(t))) {
        const count = byPath[path]?.length ?? 0;
        if (count > bestCount) {
          bestCount = count;
          bestPath = path;
        }
      }
      if (bestPath) return bestPath;

      return get(defaultField(t));
    }, [])
  );

  // Auto-assign chain: remembered → most-common label in the field → first
  // class in the field's schema.
  const computeLabelFor = useAtomCallback(
    useCallback((get, _set, path: string): string | null => {
      const remembered = get(lastUsedLabelAtom(path));
      if (remembered) return remembered;

      const fieldLabels = get(labelsByPath)[path] ?? [];
      const withLabel = fieldLabels.filter((l) => l.data?.label);
      if (withLabel.length > 0) {
        const counts = countBy(withLabel, (l) => l.data.label as string);
        const top = maxBy(Object.entries(counts), ([, c]) => c);
        if (top?.[0]) return top[0];
      }

      const classes = get(labelSchemaData(path))?.label_schema?.classes;
      return classes?.[0] ?? null;
    }, [])
  );

  const selectExisting = useAtomCallback(
    useCallback((get, set, labelAtom: PrimitiveAtom<AnnotationLabel>) => {
      set(savedLabel, get(labelAtom).data);
      set(editing, labelAtom);
    }, [])
  );
  const select = useCallback<AnnotationContext["select"]>(
    (labelAtom) => selectExisting(labelAtom),
    [selectExisting]
  );

  const clear = useCallback<AnnotationContext["clear"]>(() => {
    recordCurrentToLastUsed();
    setSaved(null);
    setEditing(null);
    setActivePrimitive(null);
  }, [recordCurrentToLastUsed, setActivePrimitive, setEditing, setSaved]);

  const createNew = useCallback<AnnotationContext["createNew"]>(
    (createType, overrides) => {
      clear();

      const resolvedField =
        overrides?.field ?? computeFieldFor(createType) ?? undefined;
      const resolvedLabelValue =
        overrides?.labelValue ??
        (resolvedField
          ? computeLabelFor(resolvedField) ?? undefined
          : undefined);

      const built = createNewLabel(
        createType,
        { ...overrides, field: resolvedField, labelValue: resolvedLabelValue },
        { scene, addOverlay, overlayFactory }
      );

      if (built) {
        const newAtom = atom<AnnotationLabel>({ isNew: true, ...built });
        setSaved(built.data);
        setEditing(newAtom);
        return built;
      }

      // No schema fields exist — flip editing to the type string to trigger
      // the AddSchema flow.
      setEditing(createType);
      return null;
    },
    [
      addOverlay,
      clear,
      computeFieldFor,
      computeLabelFor,
      overlayFactory,
      scene,
      setEditing,
      setSaved,
    ]
  );

  const setData = useCallback<AnnotationContext["setData"]>(
    (next, options) => writeData(next, options?.replace),
    [writeData]
  );

  const setField = useCallback<AnnotationContext["setField"]>(
    (path) => writeField(path),
    [writeField]
  );

  const lastUsed = useMemo<AnnotationContext["lastUsed"]>(
    () => ({
      fieldFor: (t) => computeFieldFor(t),
      labelFor: (p) => computeLabelFor(p),
      recordField: (t, path) => writeLastUsedField(t, path),
      recordLabel: (path, value) => writeLastUsedLabel(path, value),
    }),
    [computeFieldFor, computeLabelFor, writeLastUsedField, writeLastUsedLabel]
  );

  return useMemo<AnnotationContext>(
    () => ({
      selected,
      setData,
      setField,
      select,
      createNew,
      clear,
      lastUsed,
    }),
    [clear, createNew, lastUsed, select, selected, setData, setField]
  );
};

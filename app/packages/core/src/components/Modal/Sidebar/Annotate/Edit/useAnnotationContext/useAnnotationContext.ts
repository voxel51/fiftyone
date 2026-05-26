import { useLighter } from "@fiftyone/lighter";
import type { AnnotationLabel } from "@fiftyone/state";
import { atom, type PrimitiveAtom, useAtomValue, useSetAtom } from "jotai";
import { atomFamily, useAtomCallback } from "jotai/utils";
import { countBy, maxBy } from "lodash";
import { useCallback, useMemo } from "react";
import { isFieldReadOnly, labelSchemaData } from "../../state";
import { labelsByPath } from "../../useLabels";
import { activePrimitiveAtom } from "../useActivePrimitive";
import {
  currentEditingMaskAtom,
  editingLabelAtom,
  type LabelType,
  pendingNewTypeAtom,
  savedLabel,
} from "./atoms";
import { type CreateOptions, createNewLabel } from "./createNew";
import {
  current,
  currentData,
  currentField,
  currentFieldIsReadOnlyAtom,
  currentOverlay,
  currentSchema,
  currentType,
  defaultField,
  fieldsOfType,
  hasChanges,
  isEditing as isEditingSelector,
  isEditingMask as isEditingMaskSelector,
  isNew as isNewSelector,
} from "./selectors";

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
  schema: ReturnType<typeof currentSchema.read> | null;
  savedData: AnnotationLabel["data"] | null;
  isEditing: boolean;
  /** True when the current label is mid-mask-authoring. */
  isEditingMask: boolean;
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
  /**
   * Update the saved-label snapshot independently of the editing pointer.
   * Use {@link AnnotationContext.select} when you also want to set the
   * editing pointer; this method is for flows where the pointer is managed
   * elsewhere (e.g. 3D label selection where looker-3d owns the editing
   * atom).
   */
  setSavedData: (data: AnnotationLabel["data"] | null) => void;
  /**
   * Mark a label id as mid-mask-authoring (when `hasMask` is true) or clear
   * that mark (when false). `selected.isEditingMask` reflects whether the
   * currently-edited label's id is in this set.
   */
  setEditingMask: (id: string, hasMask: boolean) => void;

  select: (labelAtom: PrimitiveAtom<AnnotationLabel>) => void;
  createNew: (
    type: LabelType,
    overrides?: CreateOptions
  ) => AnnotationLabel | null;
  clear: () => void;
  /**
   * Returns true when the supplied atom is the one currently being edited.
   * Compares against the editing pointer at call time (no stale snapshot),
   * so it's safe inside `useEffect` callbacks that don't list the editing
   * state in their deps.
   *
   * Use this to ask "is THIS label atom the active one?" without leaking
   * the underlying atom pointer through the public API.
   */
  isEditingAtom: (labelAtom: PrimitiveAtom<AnnotationLabel>) => boolean;

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
  const schema = useAtomValue(currentSchema);
  const savedData = useAtomValue(savedLabel);
  const isEditing = useAtomValue(isEditingSelector);
  const isEditingMask = useAtomValue(isEditingMaskSelector);
  const isNew = useAtomValue(isNewSelector);
  const dirty = useAtomValue(hasChanges);
  const fieldReadOnly = useAtomValue(currentFieldIsReadOnlyAtom);
  const pendingNewType = useAtomValue(pendingNewTypeAtom);

  const selected = useMemo<AnnotationContextSelected>(
    () => ({
      label,
      data,
      field: field ?? null,
      type,
      overlay,
      schema,
      savedData,
      isEditing,
      isEditingMask,
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
      isEditingMask,
      isNew,
      label,
      overlay,
      pendingNewType,
      savedData,
      schema,
      type,
    ]
  );

  const writeData = useSetAtom(currentData);
  const writeField = useSetAtom(currentField);
  const setEditingLabel = useSetAtom(editingLabelAtom);
  const setPendingNewType = useSetAtom(pendingNewTypeAtom);
  const setSaved = useSetAtom(savedLabel);
  // activePrimitiveAtom is `atom<string | null>(null)` and jotai's inference
  // loses the WritableAtom shape — cast at the use site.
  const setActivePrimitive = useSetAtom(
    activePrimitiveAtom as PrimitiveAtom<string | null>
  );

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
      const data = get(labelAtom).data;
      set(savedLabel, data);
      set(editingLabelAtom, labelAtom);
      set(pendingNewTypeAtom, null);
      // Initialize the mid-mask flag from the just-selected label's data
      // so the flag is correct even when no lighter event has fired yet.
      const maskFields = data as { mask?: unknown; mask_path?: unknown };
      set(currentEditingMaskAtom, Boolean(maskFields.mask || maskFields.mask_path));
    }, [])
  );
  const select = useCallback<AnnotationContext["select"]>(
    (labelAtom) => selectExisting(labelAtom),
    [selectExisting]
  );

  const compareEditingAtom = useAtomCallback(
    useCallback(
      (get, _set, labelAtom: PrimitiveAtom<AnnotationLabel>) =>
        get(editingLabelAtom) === labelAtom,
      []
    )
  );
  const isEditingAtom = useCallback<AnnotationContext["isEditingAtom"]>(
    // useAtomCallback's signature widens the return to `Result | Promise<Result>`;
    // our callback is synchronous so this is always boolean.
    (labelAtom) => compareEditingAtom(labelAtom) as boolean,
    [compareEditingAtom]
  );

  const setCurrentEditingMask = useSetAtom(currentEditingMaskAtom);
  const clear = useCallback<AnnotationContext["clear"]>(() => {
    recordCurrentToLastUsed();
    setSaved(null);
    setEditingLabel(null);
    setPendingNewType(null);
    setActivePrimitive(null);
    setCurrentEditingMask(false);
  }, [
    recordCurrentToLastUsed,
    setActivePrimitive,
    setCurrentEditingMask,
    setEditingLabel,
    setPendingNewType,
    setSaved,
  ]);

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
        setEditingLabel(newAtom);
        return built;
      }

      // No schema fields exist — set pendingNewType to trigger the
      // AddSchema flow.
      setPendingNewType(createType);
      return null;
    },
    [
      addOverlay,
      clear,
      computeFieldFor,
      computeLabelFor,
      overlayFactory,
      scene,
      setEditingLabel,
      setPendingNewType,
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

  const setSavedData = useCallback<AnnotationContext["setSavedData"]>(
    (data) => setSaved(data),
    [setSaved]
  );

  const writeEditingMask = useAtomCallback(
    useCallback((get, set, id: string, hasMask: boolean) => {
      const currentId = (get(current)?.data as { _id?: string } | undefined)?._id;
      if (currentId === id) {
        set(currentEditingMaskAtom, hasMask);
      }
    }, [])
  );
  const setEditingMask = useCallback<AnnotationContext["setEditingMask"]>(
    (id, hasMask) => writeEditingMask(id, hasMask),
    [writeEditingMask]
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
      setSavedData,
      setEditingMask,
      select,
      createNew,
      clear,
      isEditingAtom,
      lastUsed,
    }),
    [
      clear,
      createNew,
      isEditingAtom,
      lastUsed,
      select,
      selected,
      setData,
      setEditingMask,
      setField,
      setSavedData,
    ]
  );
};

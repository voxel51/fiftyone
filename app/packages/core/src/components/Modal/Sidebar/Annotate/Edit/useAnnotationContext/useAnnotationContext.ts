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
  pendingNewTypeAtom,
  savedLabel,
} from "./atoms";
import { createNewLabel } from "./createNew";
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
import type {
  AnnotationContext,
  AnnotationContextSelected,
  LabelType,
} from "./types";

// Per-type memory: each label type remembers its last-used field
// independently so switching between modes doesn't clobber the others.
const lastUsedFieldAtom = atomFamily(
  (_type: LabelType) =>
    atom<string | null>(null) as PrimitiveAtom<string | null>
);

// Per-field memory: each field remembers its last-used class independently.
const lastUsedLabelAtom = atomFamily(
  (_field: string) =>
    atom<string | null>(null) as PrimitiveAtom<string | null>
);

/**
 * Hook fronting the annotation editing pointer. Returns the
 * {@link AnnotationContext} API — see the interface for per-method docs.
 * `select` accepts any `PrimitiveAtom<AnnotationLabel>`, including atoms
 * managed externally (e.g. looker-3d's cuboid/polyline editing atoms).
 */
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

  const readSelected = useAtomCallback(
    useCallback((get): AnnotationContextSelected => {
      const isNewValue = get(isNewSelector);
      return {
        label: get(current),
        data: get(currentData),
        field: get(currentField) ?? null,
        type: get(currentType),
        overlay: get(currentOverlay),
        schema: get(currentSchema),
        savedData: get(savedLabel),
        isEditing: get(isEditingSelector),
        isEditingMask: get(isEditingMaskSelector),
        isNew: Boolean(isNewValue),
        hasChanges: get(hasChanges),
        isFieldReadOnly: get(currentFieldIsReadOnlyAtom),
        pendingNewType: get(pendingNewTypeAtom),
      };
    }, [])
  );

  const writeData = useSetAtom(currentData);
  const writeField = useSetAtom(currentField);
  const setEditingLabel = useSetAtom(editingLabelAtom);
  const setPendingNewType = useSetAtom(pendingNewTypeAtom);
  const setSaved = useSetAtom(savedLabel);
  // jotai loses the WritableAtom shape on plain `atom<T>(initial)` — cast.
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

  // remembered → most-populated → defaultField; skip if remembered is read-only.
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

  // remembered → most-common in field → first class in schema.
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
      // Seed mask flag from committed data — no lighter event has fired yet.
      const maskFields = data as { mask?: unknown; mask_path?: unknown };
      set(
        currentEditingMaskAtom,
        Boolean(maskFields.mask || maskFields.mask_path)
      );
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
    // useAtomCallback widens to `Result | Promise<Result>`; we're sync.
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

      // No schema fields — trigger the AddSchema flow.
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
      const currentId = get(current)?.data._id;
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
      readSelected,
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
      readSelected,
      select,
      selected,
      setData,
      setEditingMask,
      setField,
      setSavedData,
    ]
  );
};

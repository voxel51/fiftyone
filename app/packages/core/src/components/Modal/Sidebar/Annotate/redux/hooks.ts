/**
 * Typed Redux hooks for the annotation store — hackday experiment.
 *
 * Read hooks pull from the Redux store.
 * Write hooks dual-write: dispatch to Redux AND set the Jotai atom,
 * so both systems stay in sync during the migration.
 */
import type { AnnotationLabel as JotaiAnnotationLabel } from "@fiftyone/state";
import { CLASSIFICATION, DETECTION, POLYLINE } from "@fiftyone/utilities";
import { getDefaultStore, type PrimitiveAtom } from "jotai";
import { useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { editing } from "../Edit/state";
import type { LabelType } from "../Edit/state";
import { activeLabelSchemas, activeSchemaTab } from "../state";
import {
  hoverLabel,
  setActiveSchemas,
  setAnnotating,
  setEditingLabel,
  setSchemaTab,
} from "./annotationSlice";
import type { AnnotationLabel } from "./annotationSlice";
import type { AnnotationAppDispatch, AnnotationRootState } from "./store";

// Typed base hooks
export const useAnnotationDispatch =
  useDispatch.withTypes<AnnotationAppDispatch>();
export const useAnnotationSelector =
  useSelector.withTypes<AnnotationRootState>();

// ── Domain read hooks ──────────────────────────────────────────────────

/** Whether any label or primitive is currently being edited. */
export const useIsEditing = (): boolean =>
  useAnnotationSelector((s) => s.annotation.isAnnotating);

/** The label currently being edited, or null. */
export const useEditingLabel = (): AnnotationLabel | null =>
  useAnnotationSelector((s) => s.annotation.editingLabel);

/** Whether the current edit is a new label (vs editing existing). */
export const useIsNewLabel = (): boolean =>
  useAnnotationSelector((s) => s.annotation.isNewLabel);

/** All labels on the current sample. */
export const useAnnotationLabels = (): AnnotationLabel[] =>
  useAnnotationSelector((s) => s.annotation.labels);

/** Active schema field paths. */
export const useActiveSchemas = (): string[] =>
  useAnnotationSelector((s) => s.annotation.activeSchemas);

/** Currently hovered label ID. */
export const useHoveredLabelId = (): string | null =>
  useAnnotationSelector((s) => s.annotation.hoveredLabelId);

/** The active schema tab (gui or json). */
export const useSchemaTab = (): "gui" | "json" =>
  useAnnotationSelector((s) => s.annotation.schemaTab);

// ── Domain write hooks ─────────────────────────────────────────────────

const LABEL_TYPES = new Set([CLASSIFICATION, DETECTION, POLYLINE]);

/**
 * Start editing a label type (creates a new label of that type).
 * Dual-writes to Redux and Jotai.
 */
export const useStartEditingType = () => {
  const dispatch = useAnnotationDispatch();

  return useCallback(
    (type: LabelType) => {
      // Redux: mark as editing with the type info
      dispatch(setAnnotating(true));
      dispatch(
        setEditingLabel({ id: "new", path: "", type, cls: type })
      );

      // Jotai: set the editing atom to the label type string
      // (this triggers the "Add Schema" UI flow)
      getDefaultStore().set(editing, type);
    },
    [dispatch]
  );
};

/**
 * Start editing an existing label (by its Jotai atom reference).
 * Dual-writes to Redux and Jotai.
 */
export const useStartEditingLabel = () => {
  const dispatch = useAnnotationDispatch();

  return useCallback(
    (atom: PrimitiveAtom<JotaiAnnotationLabel>) => {
      const store = getDefaultStore();
      const label = store.get(atom);

      // Redux: set the serialized label
      dispatch(setAnnotating(true));
      dispatch(
        setEditingLabel({
          id: label.data?._id ?? "unknown",
          path: label.path,
          type: label.type,
          cls: label.data?._cls ?? "",
          label: label.data?.label,
          confidence: label.data?.confidence,
          boundingBox: label.data?.bounding_box,
        })
      );

      // Jotai: set the editing atom to the PrimitiveAtom reference
      store.set(editing, atom);
    },
    [dispatch]
  );
};

/**
 * Stop editing (clear the current edit).
 * Dual-writes to Redux and Jotai.
 */
export const useStopEditing = () => {
  const dispatch = useAnnotationDispatch();

  return useCallback(() => {
    dispatch(setAnnotating(false));
    dispatch(setEditingLabel(null));
    getDefaultStore().set(editing, null);
  }, [dispatch]);
};

/**
 * Set the hovered label ID.
 * Dispatches to Redux only (hover state isn't in Jotai).
 */
export const useSetHoveredLabel = () => {
  const dispatch = useAnnotationDispatch();

  return useCallback(
    (labelId: string | null) => {
      dispatch(hoverLabel(labelId));
    },
    [dispatch]
  );
};

/**
 * Read+write the schema tab (gui/json). Dual-writes to Redux and Jotai.
 */
export const useSchemaTabState = (): [
  "gui" | "json",
  (tab: "gui" | "json") => void,
] => {
  const tab = useSchemaTab();
  const dispatch = useAnnotationDispatch();

  const setTab = useCallback(
    (value: "gui" | "json") => {
      dispatch(setSchemaTab(value));
      getDefaultStore().set(activeSchemaTab, value);
    },
    [dispatch]
  );

  return [tab, setTab];
};

/**
 * Read+write active schemas. Dual-writes to Redux and Jotai.
 */
export const useActiveSchemasState = (): [
  string[],
  (schemas: string[] | null) => void,
] => {
  const schemas = useActiveSchemas();
  const dispatch = useAnnotationDispatch();

  const setSchemas = useCallback(
    (value: string[] | null) => {
      dispatch(setActiveSchemas(value ?? []));
      getDefaultStore().set(activeLabelSchemas, value);
    },
    [dispatch]
  );

  return [schemas, setSchemas];
};

/** Label count from the Redux store. */
export const useAnnotationLabelCount = (): number =>
  useAnnotationSelector((s) => s.annotation.labels.length);

// ── Derived selector hooks (replace Jotai derived atoms) ───────────────

import {
  selectFieldAttributeCount,
  selectFieldType,
  selectFieldTypes,
  selectFieldsOfType,
  selectInactiveLabelSchemas,
  selectVisibleLabelSchemas,
  type LabelType,
} from "./annotationSlice";

/** visibleLabelSchemas — active ∩ explore, with primitives always visible. */
export const useVisibleLabelSchemas = (): string[] =>
  useAnnotationSelector(selectVisibleLabelSchemas);

/** inactiveLabelSchemas — schema fields NOT in activeSchemas. */
export const useInactiveLabelSchemas = (): string[] =>
  useAnnotationSelector(selectInactiveLabelSchemas);

/** fieldTypes — map of active field paths to their capitalized types. */
export const useFieldTypes = (): Record<string, string> =>
  useAnnotationSelector(selectFieldTypes);

/** fieldType for a specific path. */
export const useFieldType = (path: string): string | undefined =>
  useAnnotationSelector(selectFieldType(path));

/** fieldAttributeCount for a specific path. */
export const useFieldAttributeCount = (path: string): number =>
  useAnnotationSelector(selectFieldAttributeCount(path));

/** Full label schemas data. */
export const useLabelSchemasData = () =>
  useAnnotationSelector((s) => s.annotation.labelSchemasData);

/** Fields matching a label type (writable only). */
export const useFieldsOfType = (type: LabelType): string[] =>
  useAnnotationSelector(selectFieldsOfType(type));

/**
 * Typed Redux hooks for the annotation store.
 *
 * Redux is the source of truth. No Jotai imports.
 */
import { useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  hoverLabel,
  setActiveSchemas,
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

// ── Domain write hooks (Redux-only, no Jotai) ─────────────────────────

/**
 * Start editing a label type (creates a new label of that type).
 * Redux-only: dispatches startEditingNewType.
 */
export const useStartEditingType = () => {
  const dispatch = useAnnotationDispatch();
  return useCallback(
    (type: LabelType) => dispatch(startEditingNewType(type)),
    [dispatch]
  );
};

/**
 * Start editing an existing label by overlayId.
 * Redux-only: dispatches startEditing (finds label in store).
 */
export const useStartEditingLabel = () => {
  const dispatch = useAnnotationDispatch();
  return useCallback(
    (overlayId: string) => dispatch(startEditingAction(overlayId)),
    [dispatch]
  );
};

/**
 * Stop editing (clear the current edit).
 * Redux-only: dispatches clearEditing.
 */
export const useStopEditing = () => {
  const dispatch = useAnnotationDispatch();
  return useCallback(() => dispatch(clearEditing()), [dispatch]);
};

/**
 * Add a label to the Redux store.
 */
export const useAddLabel = () => {
  const dispatch = useAnnotationDispatch();
  return useCallback(
    (label: ReduxAnnotationLabel) => dispatch(addLabelAction(label)),
    [dispatch]
  );
};

/**
 * Remove a label from the Redux store by overlayId.
 */
export const useRemoveLabel = () => {
  const dispatch = useAnnotationDispatch();
  return useCallback(
    (overlayId: string) => dispatch(removeLabelByOverlayId(overlayId)),
    [dispatch]
  );
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
    },
    [dispatch]
  );

  return [tab, setTab];
};

/**
 * Read+write active schemas. Redux-only.
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
  addLabel as addLabelAction,
  clearEditing,
  removeLabelByOverlayId,
  setLabels as setLabelsAction,
  selectCurrentData,
  selectCurrentField,
  selectCurrentFieldIsReadOnly,
  selectCurrentFields,
  selectCurrentOverlayId,
  selectCurrentType,
  selectFieldAttributeCount,
  selectFieldType,
  selectFieldTypes,
  selectFieldsOfType,
  selectInactiveLabelSchemas,
  selectLabelByOverlayId,
  selectLabelsByPath,
  selectVisibleLabelSchemas,
  startEditing as startEditingAction,
  startEditingNewType,
  updateEditingLabelData,
  type AnnotationLabel as ReduxAnnotationLabel,
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

/** Current label type being edited (Classification/Detection/Polyline or null). */
export const useCurrentType = (): LabelType | null =>
  useAnnotationSelector(selectCurrentType);

/** Current field path of the label being edited. */
export const useCurrentField = (): string | null =>
  useAnnotationSelector(selectCurrentField);

/** Whether the current field is read-only. */
export const useCurrentFieldIsReadOnly = (): boolean =>
  useAnnotationSelector(selectCurrentFieldIsReadOnly);

/** Writable fields for the current label type. */
export const useCurrentFields = (): string[] =>
  useAnnotationSelector(selectCurrentFields);

/** The overlay ID of the label being edited (use with useOverlayById). */
export const useCurrentOverlayId = (): string | null =>
  useAnnotationSelector(selectCurrentOverlayId);

/** The data blob of the label being edited. */
export const useCurrentData = (): Record<string, unknown> | null =>
  useAnnotationSelector(selectCurrentData);

/**
 * Update the data on the currently-editing label.
 */
export const useUpdateEditingData = () => {
  const dispatch = useAnnotationDispatch();

  return useCallback(
    (data: Record<string, unknown>) => {
      dispatch(updateEditingLabelData(data));
    },
    [dispatch]
  );
};

/** Labels grouped by field path. */
export const useLabelsByPath = () =>
  useAnnotationSelector(selectLabelsByPath);

/** Look up a label by overlayId. */
export const useLabelByOverlayId = (overlayId: string) =>
  useAnnotationSelector(selectLabelByOverlayId(overlayId));

/** Set the full labels array. */
export const useSetLabels = () => {
  const dispatch = useAnnotationDispatch();
  return useCallback(
    (labels: ReduxAnnotationLabel[]) =>
      dispatch(setLabelsAction(labels)),
    [dispatch]
  );
};

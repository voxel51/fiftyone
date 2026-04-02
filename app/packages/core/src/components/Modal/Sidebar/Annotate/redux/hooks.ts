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
import { hoverLabel, setAnnotating, setEditingLabel } from "./annotationSlice";
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

/**
 * Typed Redux hooks for the annotation store — hackday experiment.
 *
 * These replace direct Jotai useAtomValue calls in annotation components.
 * Jotai remains the write-side source of truth (bridged into Redux);
 * components read from Redux instead.
 */
import { useDispatch, useSelector } from "react-redux";
import type { AnnotationAppDispatch, AnnotationRootState } from "./store";
import type { AnnotationLabel } from "./annotationSlice";

// Typed base hooks
export const useAnnotationDispatch = useDispatch.withTypes<AnnotationAppDispatch>();
export const useAnnotationSelector = useSelector.withTypes<AnnotationRootState>();

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

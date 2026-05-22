/**
 * Re-export shim for legacy import paths.
 *
 * Atoms and selectors that used to live here have been moved into
 * `./useAnnotationContext/atoms.ts` and `./useAnnotationContext/selectors.ts`.
 * Consumers should prefer the `useAnnotationContext` hook over reading these
 * atoms directly; this file remains for the in-progress migration.
 */
export { editing, savedLabel, type LabelType } from "./useAnnotationContext/atoms";
export {
  current,
  currentData,
  currentDisabledFields,
  currentField,
  currentFieldIsReadOnlyAtom,
  currentFields,
  currentOverlay,
  currentSchema,
  currentType,
  defaultField,
  disabledFields,
  fieldsOfType,
  hasChanges,
  isEditing,
  isNew,
} from "./useAnnotationContext/selectors";

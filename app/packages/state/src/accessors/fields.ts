import { DICT_FIELD, VALID_PRIMITIVE_TYPES } from "@fiftyone/utilities";
import { useReverbValue } from "@fiftyone/reverb";
import { activeFields, field, fieldPaths, labelFields, State } from "../atoms";

const PRIMITIVE_FTYPES = [...VALID_PRIMITIVE_TYPES, DICT_FIELD];

/**
 * The field paths currently toggled visible in the sidebar.
 */
export const useActiveFields = (params: { modal: boolean }) =>
  useReverbValue(activeFields(params));

/**
 * The label field paths in the dataset schema.
 */
export const useLabelFields = (params: { space?: State.SPACE } = {}) =>
  useReverbValue(labelFields(params));

/**
 * The primitive (non-label) field paths in the dataset schema, sample and
 * frame spaces alike.
 */
export const usePrimitiveFieldPaths = (): string[] =>
  useReverbValue(fieldPaths({ ftype: PRIMITIVE_FTYPES }));

/** Field paths of the dataset's schema, filtered by `params` (see `fieldPaths`). */
export const useFieldPaths = (
  params: Parameters<typeof fieldPaths>[0],
): string[] => useReverbValue(fieldPaths(params));

/**
 * A field's `ftype`, or undefined when the path is not in the schema.
 */
export const useFieldType = (path: string | null): string | undefined =>
  useReverbValue(field(path ?? ""))?.ftype;

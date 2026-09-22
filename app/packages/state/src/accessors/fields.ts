import { useReverbValue } from "@fiftyone/reverb";
import { activeFields, fieldPaths, labelFields, State } from "../atoms";

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

/** Field paths of the dataset's schema, filtered by `params` (see `fieldPaths`). */
export const useFieldPaths = (
  params: Parameters<typeof fieldPaths>[0],
): string[] => useReverbValue(fieldPaths(params));

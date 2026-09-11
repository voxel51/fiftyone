import { DICT_FIELD, VALID_PRIMITIVE_TYPES } from "@fiftyone/utilities";
import { useRecoilValue } from "recoil";
import { activeFields, fieldPaths, labelFields, State } from "../recoil";

const PRIMITIVE_FTYPES = [...VALID_PRIMITIVE_TYPES, DICT_FIELD];

/**
 * The field paths currently toggled visible in the sidebar.
 */
export const useActiveFields = (params: { modal: boolean }) =>
  useRecoilValue(activeFields(params));

/**
 * The label field paths in the dataset schema.
 */
export const useLabelFields = (params: { space?: State.SPACE } = {}) =>
  useRecoilValue(labelFields(params));

/**
 * The primitive (non-label) field paths in the dataset schema, sample and
 * frame spaces alike.
 */
export const usePrimitiveFieldPaths = (): string[] =>
  useRecoilValue(fieldPaths({ ftype: PRIMITIVE_FTYPES }));

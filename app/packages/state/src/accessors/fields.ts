import { useRecoilValue } from "recoil";
import { activeFields, labelFields, State } from "../recoil";

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

import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import { disabledCheckboxPaths } from "../recoil/sidebar";
import { sidebarExpanded } from "../recoil/sidebarExpanded";

/**
 * Returns the set of field paths that are disabled in the sidebar checkbox list.
 * Includes unsupported field types (DictField, VectorField, etc.) and frame fields that are not labels.
 */
export const useDisabledCheckboxPaths = (): Set<string> =>
  useRecoilValue(disabledCheckboxPaths);

interface SidebarExpandedParams {
  /** The dot-notation field path, e.g. `"ground_truth"` or `"ground_truth.label"`. */
  path: string;
  /** Whether the sidebar is in modal context (`true`) or grid context (`false`). */
  modal: boolean;
}

/**
 * Returns whether the given sidebar path is currently expanded.
 *
 * Prefer this over reading `fos.sidebarExpanded` directly so that
 * call sites remain decoupled from the underlying recoil atom.
 */
export const useSidebarExpanded = (params: SidebarExpandedParams): boolean =>
  useRecoilValue(sidebarExpanded(params));

/**
 * Returns a setter for the expanded state of the given sidebar path.
 * Use this when the component only needs to write, not read.
 *
 * @example
 * const setExpanded = useSetSidebarExpanded({ path: "ground_truth", modal: false });
 * setExpanded(true);
 */
export const useSetSidebarExpanded = (params: SidebarExpandedParams) =>
  useSetRecoilState(sidebarExpanded(params));

/**
 * Returns `[expanded, setExpanded]` for the given sidebar path —
 * the standard read/write accessor for toggling field expansion.
 *
 * @example
 * const [expanded, setExpanded] = useSidebarExpandedState({ path, modal });
 * setExpanded((v) => !v);
 */
export const useSidebarExpandedState = (
  params: SidebarExpandedParams,
): [boolean, (value: boolean | ((prev: boolean) => boolean)) => void] =>
  useRecoilState(sidebarExpanded(params));

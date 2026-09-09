import { atom, type PrimitiveAtom, useAtomValue, useSetAtom } from "jotai";
import type { ReactElement } from "react";
import { useMemo } from "react";

export type StatusContent = ReactElement | null;

/**
 * Content of the modal status bar (the floating hint at the top of the sample
 * pane). A plain module-level atom (not a Provider/Context-scoped store) so
 * writers mounted anywhere in the modal and the bar's reader resolve to the
 * same modal-default jotai store.
 */
const statusContentAtom = atom<StatusContent>(
  null,
) as PrimitiveAtom<StatusContent>;

/**
 * Hook for status registrars. Call `setContent(<XStatus />)` when a mode or
 * task becomes active, `setContent(null)` when it leaves.
 *
 * Last-writer-wins; rely on conditional mounting / effect cleanup so at most
 * one writer is live and React's commit ordering handles transitions.
 */
export const useModalStatusBar = () => {
  const setContent = useSetAtom(statusContentAtom);
  return useMemo(() => ({ setContent }), [setContent]);
};

/** Reads the current status bar content. Internal to the bar. */
export const useModalStatusBarContent = () => useAtomValue(statusContentAtom);

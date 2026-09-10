import { atom, type PrimitiveAtom, useAtomValue, useSetAtom } from "jotai";
import type { ReactElement } from "react";
import { useMemo } from "react";

export type StatusContent = ReactElement | null;

/**
 * Content of the modal status bar. A module-level atom so writers anywhere in
 * the modal and the bar's reader share the same default jotai store.
 */
const statusContentAtom = atom<StatusContent>(
  null,
) as PrimitiveAtom<StatusContent>;

/**
 * Hook for status registrars: `setContent(<XStatus />)` on enter,
 * `setContent(null)` on leave. Last-writer-wins, so keep at most one writer
 * mounted.
 */
export const useModalStatusBar = () => {
  const setContent = useSetAtom(statusContentAtom);
  return useMemo(() => ({ setContent }), [setContent]);
};

/** Reads the current status bar content. Internal to the bar. */
export const useModalStatusBarContent = () => useAtomValue(statusContentAtom);

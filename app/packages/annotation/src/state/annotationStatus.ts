import { atom, type PrimitiveAtom, useAtomValue, useSetAtom } from "jotai";
import type { ReactElement } from "react";
import { useMemo } from "react";

export type AnnotationStatusContent = ReactElement | null;

/**
 * Module-private content for the annotation top bar's right-hand status slot.
 * A plain module-level atom (not a Provider/Context-scoped store) so writers
 * mounted anywhere in an annotation surface and the bar's reader resolve to
 * the same modal-default jotai store.
 */
const statusContentAtom = atom<AnnotationStatusContent>(
  null,
) as PrimitiveAtom<AnnotationStatusContent>;

/**
 * Programmatic control over the top bar's status slot. Call
 * `setContent(<PropagationProgress />)` to show something (e.g. propagation
 * progress), `setContent(null)` to clear it. Last-writer-wins; rely on
 * conditional mounting / effect cleanup so at most one writer is live.
 *
 * @example
 * const { setContent } = useAnnotationStatus();
 * useEffect(() => {
 *   setContent(<StatusItem icon={<Spinner />} label={`${pct}%`} />);
 *   return () => setContent(null);
 * }, [pct, setContent]);
 */
export const useAnnotationStatus = () => {
  const setContent = useSetAtom(statusContentAtom);
  return useMemo(() => ({ setContent }), [setContent]);
};

/** Reads the current status-slot content. Internal to the top bar. */
export const useAnnotationStatusContent = () => useAtomValue(statusContentAtom);

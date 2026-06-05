import { atom, type PrimitiveAtom, useAtomValue, useSetAtom } from "jotai";
import type { ReactElement } from "react";
import { useMemo } from "react";

export type VideoAnnotationStatusContent = ReactElement | null;

/**
 * Module-private content for the top bar's right-hand status slot. A plain
 * module-level atom (not a TilingProvider/Context-scoped store) so writers
 * mounted anywhere in the surface and the bar's reader resolve to the same
 * modal-default jotai store — see the "No TilingProvider" note in
 * {@link VideoAnnotationSurface}.
 */
const statusContentAtom = atom<VideoAnnotationStatusContent>(
  null
) as PrimitiveAtom<VideoAnnotationStatusContent>;

/**
 * Programmatic control over the top bar's status slot. Call
 * `setContent(<PropagationProgress />)` to show something (e.g. propagation
 * progress), `setContent(null)` to clear it. Last-writer-wins; rely on
 * conditional mounting / effect cleanup so at most one writer is live.
 *
 * @example
 * const { setContent } = useVideoAnnotationStatus();
 * useEffect(() => {
 *   setContent(<StatusItem icon={<Spinner />} label={`${pct}%`} />);
 *   return () => setContent(null);
 * }, [pct, setContent]);
 */
export const useVideoAnnotationStatus = () => {
  const setContent = useSetAtom(statusContentAtom);
  return useMemo(() => ({ setContent }), [setContent]);
};

/** Reads the current status-slot content. Internal to the top bar. */
export const useVideoAnnotationStatusContent = () =>
  useAtomValue(statusContentAtom);

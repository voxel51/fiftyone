import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useLayoutEffect,
} from "react";
import type { ReactNode } from "react";

interface FramePresentation {
  readonly sourceKey: string;
  readonly onPresented: () => void;
  readonly presented: boolean;
  readonly unavailableTileIds: ReadonlySet<string>;
  readonly setUnavailable: (tileId: string, unavailable: boolean) => void;
}

const context = createContext<FramePresentation | null>(null);
const EMPTY_TILE_IDS: ReadonlySet<string> = new Set();

/** Routes a rendered frame only to the host that owns its source. */
export function FramePresentationProvider({
  children,
  sourceKey,
  presentationKey,
}: {
  readonly sourceKey: string;
  readonly presentationKey?: string;
  readonly children: ReactNode;
}) {
  const scopeKey = JSON.stringify([sourceKey, presentationKey]);
  const [renderedSourceKey, setRenderedSourceKey] = useState<string | null>(
    null,
  );
  // This effect resets A -> B -> A even when B never rendered a frame.
  useLayoutEffect(() => setRenderedSourceKey(null), [scopeKey]);
  const onPresented = useCallback(
    () => setRenderedSourceKey(scopeKey),
    [scopeKey],
  );
  const presented = renderedSourceKey === scopeKey;
  const [unavailable, setUnavailableState] = useState({
    sourceKey: "",
    tileIds: EMPTY_TILE_IDS,
  });
  const setUnavailable = useCallback(
    (tileId: string, value: boolean) => {
      setUnavailableState((current) => {
        if (!value && current.sourceKey !== scopeKey) return current;
        const currentIds =
          current.sourceKey === scopeKey ? current.tileIds : EMPTY_TILE_IDS;
        if (currentIds.has(tileId) === value) return current;
        const tileIds = new Set(currentIds);
        if (value) tileIds.add(tileId);
        else tileIds.delete(tileId);
        return { sourceKey: scopeKey, tileIds };
      });
    },
    [scopeKey],
  );
  const unavailableTileIds =
    unavailable.sourceKey === scopeKey ? unavailable.tileIds : EMPTY_TILE_IDS;
  const value = useMemo(
    () => ({
      onPresented,
      presented,
      sourceKey,
      setUnavailable,
      unavailableTileIds,
    }),
    [onPresented, presented, sourceKey, setUnavailable, unavailableTileIds],
  );
  return <context.Provider value={value}>{children}</context.Provider>;
}

/** Error/empty panes reveal their message instead of waiting for impossible frames. */
export function useFrameUnavailable(
  sourceKey: string,
  tileId: string | null,
  unavailable: boolean,
): void {
  const presentation = useContext(context);
  const targetKey = presentation?.sourceKey;
  const setUnavailable = presentation?.setUnavailable;
  // This effect scopes terminal-pane notices to the current presentation owner.
  useLayoutEffect(() => {
    if (!sourceKey || !tileId || sourceKey !== targetKey || !setUnavailable)
      return;
    setUnavailable(tileId, unavailable);
    return () => setUnavailable(tileId, false);
  }, [sourceKey, targetKey, setUnavailable, tileId, unavailable]);
}

/** Reads the destination panes that cannot produce a media frame. */
export function useUnavailableFrameTiles(): ReadonlySet<string> {
  return useContext(context)?.unavailableTileIds ?? EMPTY_TILE_IDS;
}

/** Reports whether the current destination has rendered a media frame. */
export function useHasPresentedFrame(): boolean {
  return useContext(context)?.presented ?? false;
}

/** Rejects outgoing or content-free frames during an in-place source change. */
export function useFramePresentation(sourceKey: string, hasContent: boolean) {
  const presentation = useContext(context);
  const onRendered = useCallback(() => {
    if (hasContent && sourceKey && sourceKey === presentation?.sourceKey) {
      presentation.onPresented();
    }
  }, [hasContent, presentation, sourceKey]);
  return presentation && hasContent ? onRendered : undefined;
}

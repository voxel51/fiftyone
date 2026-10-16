import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
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
  // Each scope change, including A -> B -> A, opens a new epoch. Callbacks
  // bound to an earlier epoch cannot mark the current scope presented or
  // unavailable, even when its source and sample match again.
  const [scope, setScope] = useState({
    epoch: 0,
    key: scopeKey,
    presented: false,
    unavailableTileIds: EMPTY_TILE_IDS,
  });
  if (scope.key !== scopeKey) {
    setScope({
      epoch: scope.epoch + 1,
      key: scopeKey,
      presented: false,
      unavailableTileIds: EMPTY_TILE_IDS,
    });
  }
  const { epoch, presented, unavailableTileIds } = scope;
  const onPresented = useCallback(
    () =>
      setScope((current) =>
        current.epoch !== epoch || current.presented
          ? current
          : { ...current, presented: true },
      ),
    [epoch],
  );
  const setUnavailable = useCallback(
    (tileId: string, value: boolean) => {
      setScope((current) => {
        if (
          current.epoch !== epoch ||
          current.unavailableTileIds.has(tileId) === value
        )
          return current;
        const tileIds = new Set(current.unavailableTileIds);
        if (value) tileIds.add(tileId);
        else tileIds.delete(tileId);
        return { ...current, unavailableTileIds: tileIds };
      });
    },
    [epoch],
  );
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

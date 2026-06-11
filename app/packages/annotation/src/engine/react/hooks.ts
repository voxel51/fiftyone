/**
 * The declarative-surface contract: equality-checked
 * selector hooks over `useSyncExternalStore` against read-only projections —
 * the type system enforces "subscribers are sinks" — plus the shared
 * ref-addressed write-half. No bridge, no handles, no exported atoms.
 *
 * Dependencies are injected: the binding-agent hook supplies the
 * engine.
 */

import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";

import type { AnnotationEngine } from "../core/engine";
import type { InteractionState } from "../interaction/interactionState";
import type { TemporalView } from "../temporal/types";
import { createSurfaceActions } from "../bridge/surfaceController";
import type { SurfaceActions } from "../bridge/surfaceController";

/** Read-only projections — no mutators, so a selector cannot write back. */
export type EngineReads = Pick<
  AnnotationEngine,
  "getLabel" | "getLabelType" | "listLabels" | "enumerateLabels" | "isDirty"
>;
export type InteractionReads = Pick<
  InteractionState,
  "getActive" | "isActive" | "getAnchor" | "getHovered" | "isHovered"
>;
export type TemporalReads = Pick<TemporalView, "getPresent" | "isPresent">;

export type Equals<T> = (a: T, b: T) => boolean;

interface SelectorCache<T> {
  version: number;
  read: () => T;
  value: T;
}

/**
 * Version-keyed, equality-checked selection: the selector re-runs on the
 * channel's version bump (or when the selector itself changes — inline
 * closures capture fresh props each render); the component re-renders only
 * when `equals` fails. The cache keeps snapshots referentially stable, as
 * `useSyncExternalStore` requires.
 */
const useVersionedSelector = <T>(
  subscribe: (listener: () => void) => () => void,
  getVersion: () => number,
  read: () => T,
  equals: Equals<T> = Object.is
): T => {
  const cache = useRef<SelectorCache<T> | null>(null);

  const getSnapshot = (): T => {
    const version = getVersion();
    const current = cache.current;

    if (current && current.version === version && current.read === read) {
      return current.value;
    }

    const next = read();

    if (current && equals(current.value, next)) {
      cache.current = { version, read, value: current.value };
      return current.value;
    }

    cache.current = { version, read, value: next };
    return next;
  };

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

/** Select from committed label state (the merged display channel). */
export const useEngineSelector = <T>(
  engine: AnnotationEngine,
  selector: (reads: EngineReads) => T,
  equals?: Equals<T>
): T => {
  const subscribe = useCallback(
    (listener: () => void) => engine.subscribe(listener),
    [engine]
  );

  return useVersionedSelector(
    subscribe,
    () => engine.getVersion(),
    () => selector(engine),
    equals
  );
};

/** Select from interaction state: active set, anchor, hover. */
export const useInteraction = <T>(
  engine: AnnotationEngine,
  selector: (reads: InteractionReads) => T,
  equals?: Equals<T>
): T => {
  const subscribe = useCallback(
    (listener: () => void) => engine.interaction.subscribe(listener),
    [engine]
  );

  return useVersionedSelector(
    subscribe,
    () => engine.interaction.getVersion(),
    () => selector(engine.interaction),
    equals
  );
};

/** Select from temporal presence. Presence ≡ pool when non-temporal. */
export const useTemporal = <T>(
  engine: AnnotationEngine,
  selector: (reads: TemporalReads) => T,
  equals?: Equals<T>
): T => {
  // presence events don't bump the engine version; a local counter folds
  // them into the snapshot key (sum of monotonic counters is monotonic)
  const presenceVersion = useRef(0);

  const subscribe = useCallback(
    (listener: () => void) => {
      const unsubscribeDisplay = engine.subscribe(listener);
      const unsubscribePresence = engine.temporal.subscribePresence(() => {
        presenceVersion.current++;
        listener();
      });

      return () => {
        unsubscribeDisplay();
        unsubscribePresence();
      };
    },
    [engine]
  );

  return useVersionedSelector(
    subscribe,
    () => engine.getVersion() + presenceVersion.current,
    () => selector(engine.temporal),
    equals
  );
};

/** The shared ref-addressed write-half, bound to the ambient sample. */
export const useSurfaceActions = (
  engine: AnnotationEngine,
  surface: string
): SurfaceActions =>
  useMemo(
    () =>
      createSurfaceActions({
        engine,
        surface,
        getSample: () => engine.ambientSample(),
      }),
    [engine, surface]
  );

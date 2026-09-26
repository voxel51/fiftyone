/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useAtom, useAtomValue, useSetAtom, useStore } from "jotai";
import {
  useCallback,
  useEffect,
  useReducer,
  useSyncExternalStore,
} from "react";
import { type Loadable, stableLoadable } from "./loadable";
import { DEFAULT_VALUE } from "./sentinel";
import { snapshot } from "./snapshot";
import { runTransaction } from "./transaction";
import type {
  CallbackInterface,
  ReverbState,
  ReverbValue,
  SetterOrUpdater,
} from "./types";

export const useReverbValue = <T>(state: ReverbValue<T>): T =>
  useAtomValue(state);

export const useSetReverbState = <T>(
  state: ReverbState<T>,
): SetterOrUpdater<T> => useSetAtom(state);

export const useReverbState = <T>(state: ReverbState<T>) => useAtom(state);

/** The store this subtree reads and writes, for callers outside a hook. */
export const useReverbStore = () => useStore();

/** Reads state that must already hold a value, throwing when it does not. */
export function useAssertedReverbValue<T>(
  state: ReverbValue<T>,
): NonNullable<T> {
  const value = useAtomValue(state);

  if (value === undefined || value === null) {
    throw new Error(`${state.debugLabel ?? "state"} is not defined`);
  }

  return value as NonNullable<T>;
}

export const useResetReverbState = <T>(state: ReverbState<T>): (() => void) => {
  const set = useSetAtom(state);

  return useCallback(() => set(DEFAULT_VALUE), [set]);
};

/**
 * Every write in one invocation commits as a single batch, which several call
 * sites rely on to avoid a second sidebar aggregation round. Reads through
 * `snapshot` are live, so a read after an await sees interleaved writes.
 */
export function useReverbCallback<Args extends readonly unknown[], Return>(
  callback: (accessors: CallbackInterface) => (...args: Args) => Return,
  dependencies: readonly unknown[] = [],
) {
  const store = useStore();

  return useCallback(
    (...args: Args) =>
      runTransaction(store, (transactional) =>
        callback({ ...transactional, snapshot: snapshot(store) })(...args),
      ),
    // The caller owns this list, matching the hook this replaces.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, ...dependencies],
  );
}

/** Reads without suspending, so a pending value is observable as "loading". */
export function useReverbValueLoadable<T>(state: ReverbValue<T>): Loadable<T> {
  const store = useStore();
  const [, advance] = useReducer((count: number) => count + 1, 0);

  const raw = useSyncExternalStore(
    useCallback(
      (onChange: () => void) => store.sub(state, onChange),
      [store, state],
    ),
    () => store.get(state) as T | Promise<T>,
  );

  const result = stableLoadable<T>(state, raw);

  useEffect(() => {
    if (result.state !== "loading") {
      return undefined;
    }

    let live = true;
    const settle = () => live && advance();
    (result.contents as Promise<T>).then(settle, settle);

    return () => {
      live = false;
    };
  }, [result]);

  return result;
}

export function useReverbStateLoadable<T>(
  state: ReverbState<T>,
): [Loadable<T>, SetterOrUpdater<T>] {
  return [useReverbValueLoadable(state), useSetAtom(state)];
}

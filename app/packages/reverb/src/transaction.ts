/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { atom as primitive, useStore } from "jotai";
import { useCallback } from "react";
import { accessors } from "./accessors";
import type { TransactionInterface } from "./types";

export type Store = ReturnType<typeof useStore>;

type Body = (accessors: TransactionInterface) => unknown;

/**
 * Jotai flushes listeners once per top-level store write, so a body run inside
 * this one commits as a single batch. `batching.test.ts` holds that contract.
 */
const transaction = primitive(null, (get, set, body: Body) =>
  body(accessors(get, set)),
);

type Observer = (store: Store) => void;

/**
 * Keyed by store rather than held in one set: a host that renders concurrent
 * requests in one process has a store per render, and a shared set would let
 * one render's observers see another's writes.
 */
const observers = new WeakMap<Store, Set<Observer>>();

/** Observers see writes made through a transaction or callback, not every set. */
export const observeTransactions = (store: Store, observer: Observer) => {
  let held = observers.get(store);

  if (!held) {
    held = new Set();
    observers.set(store, held);
  }

  held.add(observer);

  return () => void held.delete(observer);
};

/** Commits every write in `body` as one batch. Writes after an await are not
 * part of it, which is the behavior this replaces. */
export function runTransaction<Return>(
  store: Store,
  body: (accessors: TransactionInterface) => Return,
): Return {
  // The atom erases the body's return type; this call site restores it.
  const result = store.set(transaction, body) as Return;

  const held = observers.get(store);

  if (held?.size) {
    // Deferred: a transaction can run during render, and an observer that
    // sets state would then update a component mid-render.
    queueMicrotask(() => {
      for (const observer of held) {
        observer(store);
      }
    });
  }

  return result;
}

export function useReverbTransaction<Args extends readonly unknown[]>(
  callback: (accessors: TransactionInterface) => (...args: Args) => void,
  dependencies: readonly unknown[] = [],
) {
  const store = useStore();

  return useCallback(
    (...args: Args) =>
      runTransaction(store, (transactional) =>
        callback(transactional)(...args),
      ),
    // The caller owns this list, matching the hook this replaces.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, ...dependencies],
  );
}
